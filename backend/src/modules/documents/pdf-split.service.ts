import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PDFParse } from 'pdf-parse';
import { PDFDocument } from 'pdf-lib';
import { Configuration } from '../../config/configuration';
import { AuthUser } from '../../common/types/auth-user';
import { DocumentSource, Role } from '../../shared/enums';
import { AccessControlService } from '../authorizations/access-control.service';
import { DocumentTypesService } from '../document-types/document-types.service';
import { SettingsService } from '../settings/settings.service';
import { AiCreditsService } from '../ai-credits/ai-credits.service';
import { GeminiService, InvoiceSegmentDetection } from '../ai/gemini.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { DocumentsService } from './documents.service';

export interface PdfSegment {
  startPage: number;
  endPage: number;
  documentNo?: string;
  documentDate?: string;
  vknTckn?: string;
  counterpartyTitle?: string;
  totalAmount?: string;
  taxAmount?: string;
}

export interface PdfSplitAnalysis {
  jobId: string;
  fileName: string;
  pageCount: number;
  /** Sınırların nasıl bulunduğu — arayüz kullanıcıya bunu açıkça söyler. */
  detectedBy: 'text' | 'ai' | 'none';
  segments: PdfSegment[];
  /** AI'a düşüldüyse harcanan kredi (0 = harcanmadı). */
  aiCreditsUsed: number;
  warning?: string;
}

interface JobState {
  jobId: string;
  userId: string;
  taxpayerId: string;
  documentTypeId: number;
  fileName: string;
  storagePath: string;
  pageCount: number;
}

const JOB_TTL_SECONDS = 60 * 60;
/** Analiz ve bölme belleğe alınıyor; makul bir üst sınır olmadan büyük PDF'ler süreci boğar. */
const MAX_PAGES = 400;
/** Bir sayfada bu kadar bile metin yoksa PDF taranmış (görüntü) kabul edilir. */
const MIN_TEXT_CHARS_PER_PAGE = 40;

function normalize(text: string): string {
  return text
    .replace(/[İIıi]/g, 'I').replace(/[şŞ]/g, 'S').replace(/[ğĞ]/g, 'G')
    .replace(/[üÜ]/g, 'U').replace(/[öÖ]/g, 'O').replace(/[çÇ]/g, 'C')
    .toUpperCase();
}

/** "Fatura No: ABC2026000001234" gibi bir başlangıç işareti. */
const DOC_NO_PATTERNS = [
  /FATURA\s*(?:NO|NUMARASI)\s*[:\s]\s*([A-Z0-9][A-Z0-9\-/]{4,})/,
  /\bETTN\s*[:\s]\s*([0-9a-fA-F-]{16,})/,
];
const INVOICE_HEADER = /(E-?ARSIV FATURA|E-?FATURA|\bFATURA\b)/;
const DATE_PATTERN = /(\d{2}[.\-/]\d{2}[.\-/]\d{4})/;
const VKN_PATTERN = /(?:VKN|TCKN|VERGI KIMLIK NO|VKN\/TCKN)\s*[:\s]\s*(\d{10,11})/;
const AMOUNT_PATTERNS = [
  /(?:VERGILER DAHIL TOPLAM TUTAR|ODENECEK TUTAR|GENEL TOPLAM)\s*[:\s]\s*([0-9.,]+)/,
];
const TAX_PATTERNS = [
  /(?:HESAPLANAN KDV|TOPLAM KDV|KDV TUTARI)\s*[:\s]\s*([0-9.,]+)/,
];

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/** "1.234,56" → "1234.56". Türkçe biçimli tutarları kanonik hale getirir. */
function parseAmount(raw?: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? String(n) : undefined;
}

/**
 * Tarihi sistemin kanonik biçimine (YYYY-MM-DD) çevirir.
 *
 * PDF metninde tarih gg.aa.yyyy yazar; bu değer olduğu gibi kaydedilirse Evrak
 * Dijitalleştir formundaki tarih alanı onu okuyamaz ve kullanıcı her faturada tarihi
 * elle yeniden girmek zorunda kalır. Doğrulayıcı da date alanları
 * için YYYY-MM-DD bekliyor (bkz. metadata.validator.ts).
 */
function normalizeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  // Zaten ISO ise olduğu gibi kabul et (AI bu biçimde dönebiliyor).
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const tr = /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/.exec(trimmed);
  return tr ? `${tr[3]}-${tr[2]}-${tr[1]}` : undefined;
}

/**
 * Tek PDF dosyasında birleştirilmiş birden fazla faturayı ayırma.
 *
 * Kullanıcı tercihi: ÖNCE metin tabanlı tespit denenir — PDF'in metin
 * katmanındaki "Fatura No" değişimi sınır kabul edilir; bu bedavadır ve dijital
 * e-Fatura/e-Arşiv çıktılarında çok isabetlidir. Yalnızca metin katmanı olmayan
 * (taranmış) PDF'lerde AI'a düşülür ve o zaman AI kredisi harcanır.
 *
 * İki adımlıdır: `analyze` sınırları bulup kaynak PDF'i geçici olarak saklar, kullanıcı
 * önizlemede düzeltir, `commit` gerçekten böler ve her parçayı ayrı evrak olarak
 * kaydeder. Kota, tekrar kontrolü ve denetim kaydı normal yükleme akışından gelir
 * (`DocumentsService.upload`), böylece iki yol arasında davranış farkı olmaz.
 */
@Injectable()
export class PdfSplitService {
  private readonly logger = new Logger(PdfSplitService.name);

  constructor(
    private readonly access: AccessControlService,
    private readonly types: DocumentTypesService,
    private readonly settings: SettingsService,
    private readonly aiCredits: AiCreditsService,
    private readonly gemini: GeminiService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly documents: DocumentsService,
    private readonly config: ConfigService<Configuration, true>,
  ) {}

  private key(jobId: string): string {
    return `pdf_split_job:${jobId}`;
  }

  async analyze(
    user: AuthUser,
    taxpayerId: string,
    documentTypeId: number,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<PdfSplitAnalysis> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Yalnızca PDF dosyası bölünebilir.');
    }
    const type = await this.types.findByIdOrThrow(documentTypeId);

    // Sayfa metinleri — sınır tespitinin birincil kaynağı.
    let pages: { num: number; text: string }[] = [];
    const parser = new PDFParse({ data: file.buffer });
    try {
      const parsed = await parser.getText();
      pages = parsed.pages.map((p) => ({ num: p.num, text: p.text ?? '' }));
    } catch {
      throw new BadRequestException('PDF okunamadı. Dosya bozuk olabilir.');
    } finally {
      await parser.destroy().catch(() => undefined);
    }

    if (!pages.length) throw new BadRequestException('PDF boş görünüyor.');
    if (pages.length > MAX_PAGES) {
      throw new BadRequestException(`PDF ${pages.length} sayfa; tek seferde en fazla ${MAX_PAGES} sayfa bölünebilir.`);
    }

    let segments = this.detectFromText(pages);
    let detectedBy: PdfSplitAnalysis['detectedBy'] = segments.length ? 'text' : 'none';
    let aiCreditsUsed = 0;
    let warning: string | undefined;

    const hasTextLayer = pages.some((p) => p.text.trim().length >= MIN_TEXT_CHARS_PER_PAGE);
    if (!hasTextLayer) {
      // Taranmış PDF — metin katmanı yok, tek çare AI.
      const ai = await this.tryAi(user, file, pages.length);
      if (ai.segments.length) {
        segments = ai.segments;
        detectedBy = 'ai';
        aiCreditsUsed = ai.creditsUsed;
      } else {
        warning = ai.warning
          ?? 'Bu PDF taranmış görünüyor ve metin içermiyor; fatura sınırları otomatik bulunamadı. Sayfa aralıklarını elle işaretleyin.';
      }
    } else if (segments.length <= 1) {
      warning = 'PDF içinde birden fazla fatura bulunamadı — tek fatura gibi görünüyor. Yine de sayfa aralıklarını elle bölebilirsiniz.';
    }

    // Hiçbir şey bulunamadıysa tüm PDF tek parça olarak sunulur; kullanıcı böler.
    if (!segments.length) segments = [{ startPage: 1, endPage: pages.length }];

    // Kaynak PDF geçici olarak saklanır; `commit` bunu okuyup böler. TTL'li Redis
    // kaydı ile birlikte, iş tamamlanmasa bile dosya sahipsiz kalmaz (temizlik `commit`
    // ya da TTL sonrası `cleanupExpired` tarafından yapılır).
    const storagePath = `temp/pdf-split/${taxpayerId}/${randomUUID()}.pdf`;
    await this.storage.upload(storagePath, file.buffer, 'application/pdf');

    const state: JobState = {
      jobId: randomUUID(),
      userId: user.userId,
      taxpayerId,
      documentTypeId: type.id,
      fileName: file.originalname,
      storagePath,
      pageCount: pages.length,
    };
    await this.redis.client.set(this.key(state.jobId), JSON.stringify(state), 'EX', JOB_TTL_SECONDS);

    return {
      jobId: state.jobId,
      fileName: file.originalname,
      pageCount: pages.length,
      detectedBy,
      segments,
      aiCreditsUsed,
      warning,
    };
  }

  /**
   * Metin katmanından sınır tespiti: bir sayfada FATURA başlığı ve bir öncekinden FARKLI
   * bir fatura no görülüyorsa orada yeni fatura başlar. Fatura no okunamazsa yalnızca
   * başlık tekrarına bakılır — çok sayfalı tek faturada başlık genelde yalnızca ilk
   * sayfada olduğu için bu, yanlış bölmeyi büyük ölçüde önler.
   */
  private detectFromText(pages: { num: number; text: string }[]): PdfSegment[] {
    const perPage = pages.map((p) => {
      const norm = normalize(p.text);
      return {
        num: p.num,
        norm,
        docNo: firstMatch(norm, DOC_NO_PATTERNS),
        hasHeader: INVOICE_HEADER.test(norm),
      };
    });

    const starts: number[] = [];
    let lastDocNo: string | undefined;
    for (const page of perPage) {
      const isFirst = starts.length === 0;
      const docNoChanged = !!page.docNo && page.docNo !== lastDocNo;
      if (isFirst || docNoChanged || (page.hasHeader && !page.docNo && !lastDocNo)) {
        starts.push(page.num);
        if (page.docNo) lastDocNo = page.docNo;
      } else if (page.docNo) {
        lastDocNo = page.docNo;
      }
    }
    if (starts.length <= 1) return starts.length === 1 && perPage.some((p) => p.hasHeader)
      ? [this.buildSegment(perPage, 1, pages.length)]
      : [];

    const segments: PdfSegment[] = [];
    for (let i = 0; i < starts.length; i += 1) {
      const start = starts[i];
      const end = i + 1 < starts.length ? starts[i + 1] - 1 : pages.length;
      segments.push(this.buildSegment(perPage, start, end));
    }
    return segments;
  }

  private buildSegment(
    perPage: { num: number; norm: string }[], startPage: number, endPage: number,
  ): PdfSegment {
    const text = perPage.filter((p) => p.num >= startPage && p.num <= endPage).map((p) => p.norm).join('\n');
    return {
      startPage,
      endPage,
      documentNo: firstMatch(text, DOC_NO_PATTERNS),
      documentDate: normalizeDate(DATE_PATTERN.exec(text)?.[1]),
      vknTckn: VKN_PATTERN.exec(text)?.[1],
      totalAmount: parseAmount(firstMatch(text, AMOUNT_PATTERNS)),
      taxAmount: parseAmount(firstMatch(text, TAX_PATTERNS)),
    };
  }

  /** Taranmış PDF'lerde AI ile sınır tespiti — kredi ve ayar kontrolleriyle. */
  private async tryAi(
    user: AuthUser, file: { buffer: Buffer }, pageCount: number,
  ): Promise<{ segments: PdfSegment[]; creditsUsed: number; warning?: string }> {
    const gemini = this.config.get('gemini', { infer: true });
    if (!gemini.apiKey) {
      return { segments: [], creditsUsed: 0, warning: 'Bu PDF taranmış ve metin içermiyor; yapay zeka desteği bu kurulumda kapalı olduğu için sınırlar otomatik bulunamadı.' };
    }
    const settings = this.settings.getCached();
    const allowed = user.role === Role.ACCOUNTANT ? settings.accountantAiEnabled : settings.taxpayerAiEnabled;
    if (!allowed) {
      return { segments: [], creditsUsed: 0, warning: 'Bu PDF taranmış; yapay zeka ile çözümleme hesabınız için kapalı olduğundan sayfa aralıklarını elle işaretleyin.' };
    }

    try {
      // Kredi ÖNCE düşülür: model çağrısı ücretlidir, çağrı yapıldıysa kredi harcanmıştır.
      await this.aiCredits.consume(user.userId, 1);
    } catch {
      return { segments: [], creditsUsed: 0, warning: 'AI krediniz yetersiz; sayfa aralıklarını elle işaretleyebilirsiniz.' };
    }

    try {
      const detected: InvoiceSegmentDetection[] = await this.gemini.detectInvoiceSegments(
        gemini.modelAdvanced, { buffer: file.buffer, mimeType: 'application/pdf' }, pageCount,
      );
      const cleaned = this.sanitizeSegments(detected, pageCount)
        .map((seg) => ({ ...seg, documentDate: normalizeDate(seg.documentDate) }));
      return { segments: cleaned, creditsUsed: 1 };
    } catch (err) {
      this.logger.warn(`PDF sınır tespiti (AI) başarısız: ${(err as Error).message}`);
      return { segments: [], creditsUsed: 1, warning: 'Yapay zeka çözümlemesi başarısız oldu; sayfa aralıklarını elle işaretleyin.' };
    }
  }

  /**
   * MODEL çıktısını güvenli hale getirir: sayfa numaraları aralık dışına taşamaz,
   * aralıklar çakışamaz ve artan sırada olmalıdır. Yalnızca AI önerisi için kullanılır —
   * kullanıcının onayladığı aralıklar sessizce düzeltilmez (bkz. assertValidSegments).
   */
  private sanitizeSegments(raw: PdfSegment[], pageCount: number): PdfSegment[] {
    const sorted = [...raw]
      .map((s) => ({ ...s, startPage: Math.trunc(s.startPage), endPage: Math.trunc(s.endPage) }))
      .filter((s) => Number.isFinite(s.startPage) && Number.isFinite(s.endPage))
      .sort((a, b) => a.startPage - b.startPage);

    const out: PdfSegment[] = [];
    let cursor = 1;
    for (const s of sorted) {
      const startPage = Math.max(cursor, Math.min(s.startPage, pageCount));
      const endPage = Math.max(startPage, Math.min(s.endPage, pageCount));
      if (startPage > pageCount) break;
      out.push({ ...s, startPage, endPage });
      cursor = endPage + 1;
      if (cursor > pageCount) break;
    }
    return out;
  }

  /** `commit` için katı doğrulama: aralıklar sınır içinde, artan ve çakışmasız olmalı. */
  private assertValidSegments(segments: PdfSegment[], pageCount: number): PdfSegment[] {
    if (!segments.length) throw new BadRequestException('Geçerli bir sayfa aralığı verilmedi.');
    const sorted = [...segments].sort((a, b) => a.startPage - b.startPage);
    let previousEnd = 0;
    for (const s of sorted) {
      if (!Number.isInteger(s.startPage) || !Number.isInteger(s.endPage)) {
        throw new BadRequestException('Sayfa numaraları tam sayı olmalıdır.');
      }
      if (s.startPage < 1 || s.endPage > pageCount) {
        throw new BadRequestException(`Sayfa aralığı 1 ile ${pageCount} arasında olmalıdır.`);
      }
      if (s.endPage < s.startPage) {
        throw new BadRequestException('Bitiş sayfası başlangıç sayfasından küçük olamaz.');
      }
      if (s.startPage <= previousEnd) {
        throw new BadRequestException('Sayfa aralıkları birbiriyle çakışıyor.');
      }
      previousEnd = s.endPage;
    }
    return sorted;
  }

  /**
   * Onaylanan aralıklara göre PDF'i böler ve her parçayı ayrı evrak olarak kaydeder.
   * Her parça normal yükleme akışından geçtiği için kotayı tüketir, tekrar kontrolüne
   * girer ve denetim kaydı oluşturur.
   */
  async commit(
    user: AuthUser, jobId: string, segments: PdfSegment[], titlePrefix?: string,
  ): Promise<{ created: number; failed: { startPage: number; reason: string }[] }> {
    const raw = await this.redis.client.get(this.key(jobId));
    if (!raw) throw new NotFoundException('Bölme işi bulunamadı ya da süresi doldu. Dosyayı yeniden yükleyin.');
    const state = JSON.parse(raw) as JobState;
    if (state.userId !== user.userId) throw new ForbiddenException('Bu işleme erişim yetkiniz yok.');
    await this.access.assertTaxpayerAccess(user, state.taxpayerId);

    // Kullanıcının onayladığı aralıklar SESSİZCE düzeltilmez — sessiz düzeltme,
    // istemediği sayfaların başka bir faturaya girmesi demek olurdu. Arayüz zaten aynı
    // kuralları uyguluyor; buradaki kontrol son savunma hattı.
    const cleaned = this.assertValidSegments(segments, state.pageCount);

    const stream = await this.storage.getObjectStream(state.storagePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const sourceBytes = Buffer.concat(chunks);

    const source = await PDFDocument.load(sourceBytes);
    const type = await this.types.findByIdOrThrow(state.documentTypeId);

    const failed: { startPage: number; reason: string }[] = [];
    let created = 0;

    for (const seg of cleaned) {
      try {
        const out = await PDFDocument.create();
        const indices = [];
        for (let p = seg.startPage; p <= seg.endPage; p += 1) indices.push(p - 1);
        const copied = await out.copyPages(source, indices);
        copied.forEach((page) => out.addPage(page));
        const bytes = Buffer.from(await out.save());

        const metadata: Record<string, string> = {};
        if (seg.documentNo) metadata.documentNo = seg.documentNo;
        // Kullanıcı önizlemede elle gg.aa.yyyy yazmış olabilir — kaydederken yine normalize edilir.
        const isoDate = normalizeDate(seg.documentDate);
        if (isoDate) metadata.documentDate = isoDate;
        if (seg.vknTckn) metadata.vknTckn = seg.vknTckn;
        if (seg.counterpartyTitle) metadata.counterpartyTitle = seg.counterpartyTitle;
        if (seg.totalAmount) metadata.totalAmount = seg.totalAmount;
        if (seg.taxAmount) metadata.taxAmount = seg.taxAmount;

        const label = seg.documentNo || `sayfa-${seg.startPage}${seg.endPage > seg.startPage ? `-${seg.endPage}` : ''}`;
        const baseName = (titlePrefix || state.fileName.replace(/\.pdf$/i, '')).slice(0, 80);

        await this.documents.upload(user, {
          taxpayerId: state.taxpayerId,
          documentTypeId: type.id,
          title: `${type.name} ${label}`,
          // Alanlar eksik olabileceği için evrak "hızlı kayıt" gibi kaydedilir ve
          // Evrak Dijitalleştir kuyruğuna düşer — zorunlu alan doğrulamasına takılıp
          // bölmenin tamamı başarısız olmasın.
          quick: true,
          metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : undefined,
          source: DocumentSource.PDF_SPLIT,
        }, {
          buffer: bytes,
          mimetype: 'application/pdf',
          originalname: `${baseName}-${label}.pdf`.replace(/[^\w.\-]+/g, '_'),
          size: bytes.length,
        });
        created += 1;
      } catch (err) {
        failed.push({ startPage: seg.startPage, reason: (err as Error).message });
      }
    }

    await this.storage.delete(state.storagePath).catch(() => undefined);
    await this.redis.client.del(this.key(jobId));

    return { created, failed };
  }

  /** Kullanıcı vazgeçtiğinde geçici dosyayı bırakmamak için. */
  async discard(user: AuthUser, jobId: string): Promise<void> {
    const raw = await this.redis.client.get(this.key(jobId));
    if (!raw) return;
    const state = JSON.parse(raw) as JobState;
    if (state.userId !== user.userId) throw new ForbiddenException('Bu işleme erişim yetkiniz yok.');
    await this.storage.delete(state.storagePath).catch(() => undefined);
    await this.redis.client.del(this.key(jobId));
  }
}
