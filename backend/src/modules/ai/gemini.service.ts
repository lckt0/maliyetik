import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration } from '../../config/configuration';
import { MetadataFieldDef } from '../../database/entities/document-type.entity';

export interface GeminiExtractionResult {
  /** Alan anahtarı → metin değeri (form state ile aynı şekil — `MetadataFieldsEditor` doğrudan tüketir). */
  fields: Record<string, string>;
  /** Modelin kendi bildirdiği genel güven skoru (0-1). */
  confidence: number;
  /** Modelin belirsiz/okuyamadığını işaretlediği alan anahtarları. */
  uncertainFields: string[];
}

/** Tek PDF içindeki bir faturanın sayfa aralığı + okunabilen alanları. */
export interface InvoiceSegmentDetection {
  startPage: number;
  endPage: number;
  documentNo?: string;
  documentDate?: string;
  vknTckn?: string;
  counterpartyTitle?: string;
  totalAmount?: string;
  taxAmount?: string;
}

export interface MaliHafizaEntryExtraction {
  /** Şeritte basılı "Z" numarası (ör. "0197") — aynen okunduğu gibi. */
  documentNo: string;
  /** YYYY-MM-DD. */
  documentDate: string;
  totalAmount: number;
  /** TOPKDV — o güne ait toplam KDV tutarı. */
  taxAmount: number;
  /** Bu satırın rakamları net okunamadı/tahmini — kullanıcı kaydetmeden önce kontrol etmeli. */
  uncertain: boolean;
}

export interface MaliHafizaStripExtraction {
  /** Şeridin üstünde el yazısı/başlık olarak görülen cihaz etiketi varsa (ör. "Manuel POS", "ÖKC P3"). */
  label?: string;
  periodStart?: string;
  periodEnd?: string;
  /** Şerit genel olarak yeterince net/okunabilir mi — false ise ciddi bir netlik sorunu var demektir. */
  readable: boolean;
  /** Şeritle ilgili tespit edilen sorun varsa kısa açıklama (bulanık, kesik, ışık yansıması vb.). */
  issue?: string;
  entries: MaliHafizaEntryExtraction[];
}

export interface MaliHafizaExtractionResult {
  strips: MaliHafizaStripExtraction[];
  /** Görselin genelinde bir sorun varsa (ör. hiçbir Mali Hafıza Raporu tanınamadı) kısa açıklama. */
  overallIssue?: string;
  /** Dosyanın çözünürlüğü tavsiye edilenin altındaysa kısa uyarı — `MaliHafizaExtractService` doldurur (Gemini'den gelmez). */
  resolutionWarning?: string;
  confidence: number;
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
/** Tek bir generateContent çağrısının üst sınırı — `ai-digitize` ucu senkron çağrıldığı için istek burada asılı kalmamalı. */
const GEMINI_TIMEOUT_MS = 120_000;
/** Hafif "yapay zeka deneyimi" çağrıları için kısa zaman aşımı — arayüz beklemede kalmasın. */
const LIGHT_TIMEOUT_MS = 20_000;
/** Geçici hatada (503/429) toplam deneme sayısı ve aradaki bekleme. */
const LIGHT_RETRIES = 2;
const LIGHT_RETRY_DELAY_MS = 900;

/**
 * Gemini generateContent istemcisi — yalnızca sunucudan çağrılır (API anahtarı
 * istemciye asla gönderilmez). Yapılandırılmış JSON çıktı için `responseSchema`
 * kullanır: her evrak türü alanı için bir şema özelliği + genel `confidence`
 * ve `uncertainFields` üretilir.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);

  constructor(private readonly config: ConfigService<Configuration, true>) {}

  /**
   * generateContent çağrısını yapar ve modelin döndürdüğü JSON metnini çözer.
   * `AbortController` ile zaman aşımına bağlanır — `ai-digitize` ucu bu çağrıyı
   * senkron beklediğinden, yanıtsız kalan bir istek HTTP isteğini süresiz asamaz.
   */
  async generateJson<T>(model: string, body: unknown): Promise<T> {
    const apiKey = this.config.get('gemini', { infer: true }).apiKey;
    if (!apiKey) {
      throw new BadGatewayException('Yapay zeka servisi yapılandırılmamış (GEMINI_API_KEY eksik).');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        this.logger.error(`Gemini isteği ${GEMINI_TIMEOUT_MS} ms içinde yanıtlamadı.`);
        throw new BadGatewayException('Yapay zeka servisi zamanında yanıt vermedi, lütfen tekrar deneyin.');
      }
      this.logger.error(`Gemini isteği başarısız: ${err}`);
      throw new BadGatewayException('Yapay zeka servisine ulaşılamadı.');
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Gemini API hatası (${res.status}): ${text}`);
      throw new BadGatewayException('Yapay zeka servisi bir hata döndürdü.');
    }

    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new BadGatewayException('Yapay zeka servisi boş yanıt döndürdü.');

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadGatewayException('Yapay zeka servisi geçersiz bir yanıt döndürdü.');
    }
  }

  /**
   * Şemasız, kısa düz metin üretimi — "yapay zeka deneyimi" özellikleri (akıllı yardımcı,
   * dönem özeti) için. JSON şeması gerektirmediğinden ucuz modelle çalışır.
   *
   * `maxOutputTokens` bilerek düşük: bu özellikler maliyeti öngörülebilir olsun diye
   * kısa cevap verir; uzun anlatım isteyen bir kullanım yok.
   */
  async generateText(
    model: string,
    prompt: string,
    opts: { maxOutputTokens?: number; systemInstruction?: string } = {},
  ): Promise<string> {
    const apiKey = this.config.get('gemini', { infer: true }).apiKey;
    if (!apiKey) throw new BadGatewayException('Yapay zeka servisi yapılandırılmamış (GEMINI_API_KEY eksik).');

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      ...(opts.systemInstruction ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } } : {}),
      generationConfig: {
        maxOutputTokens: opts.maxOutputTokens ?? 600,
        temperature: 0.2,
        // Düşünme kapalı: açıkken "düşünme" token'ları çıktı bütçesinden düşülüyor ve
        // kısa cevaplar kesilebiliyor. Bu işler akıl yürütme gerektirmez; kapalıyken
        // çağrı da belirgin biçimde ucuzlar.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    // 503 (model meşgul) ve 429 (hız sınırı) geçicidir; kısa bir beklemeden sonra bir kez
    // daha denenir. Diğer hatalarda tekrar denenmez (kalıcı hata).
    for (let attempt = 0; attempt < LIGHT_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LIGHT_TIMEOUT_MS);
      try {
        const res = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          return (text ?? '').trim();
        }
        const retryable = res.status === 503 || res.status === 429;
        if (!retryable || attempt === LIGHT_RETRIES - 1) {
          this.logger.error(`Gemini metin üretimi başarısız (${res.status})`);
          throw new BadGatewayException('Yapay zeka servisi yanıt veremedi.');
        }
        this.logger.warn(`Gemini geçici hata (${res.status}) — tekrar deneniyor.`);
      } catch (err) {
        if (controller.signal.aborted) {
          throw new BadGatewayException('Yapay zeka servisi zamanında yanıt vermedi.');
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
      await new Promise((r) => setTimeout(r, LIGHT_RETRY_DELAY_MS));
    }
    throw new BadGatewayException('Yapay zeka servisi yanıt veremedi.');
  }

  async extract(
    model: string,
    file: { buffer: Buffer; mimeType: string },
    fields: MetadataFieldDef[],
  ): Promise<GeminiExtractionResult> {
    const parsed = await this.generateJson<Record<string, unknown>>(model, {
      contents: [
        {
          parts: [
            { inlineData: { mimeType: file.mimeType, data: file.buffer.toString('base64') } },
            { text: buildPrompt(fields) },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: buildResponseSchema(fields),
      },
    });

    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = parsed[f.key];
      if (v === undefined || v === null || v === '') continue;
      out[f.key] = String(v);
    }

    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    let uncertainFields = Array.isArray(parsed.uncertainFields) ? parsed.uncertainFields.map(String) : [];

    // Fiş Grup No, belgede yazan değer değil, evrak tarihinin ay+yıl'ı olmalı (örn. 13.06.2026 -> 062026)
    // — muhasebe tarafında Z-Raporları böyle gruplanıyor. AI'ın okuduğu değeri bu türetilmiş değerle eziyoruz.
    if (fields.some((f) => f.key === 'receiptGroupNo') && out.documentDate) {
      const groupNo = formatReceiptGroupNo(out.documentDate);
      if (groupNo) {
        out.receiptGroupNo = groupNo;
        uncertainFields = uncertainFields.filter((k) => k !== 'receiptGroupNo');
      }
    }

    return { fields: out, confidence, uncertainFields };
  }

  /**
   * Tek bir PDF'te birleştirilmiş birden fazla faturanın sınırlarını bulur.
   *
   * Metin tabanlı tespit (bkz. PdfSplitService) taranmış/görüntü PDF'lerde çalışmaz —
   * sayfada hiç metin katmanı yoktur. O durumda PDF doğrudan modele verilir: Gemini
   * PDF'i yerel olarak okuyabildiği için sayfaların ayrıca görüntüye çevrilmesi gerekmez.
   */
  async detectInvoiceSegments(
    model: string,
    file: { buffer: Buffer; mimeType: string },
    pageCount: number,
  ): Promise<InvoiceSegmentDetection[]> {
    const parsed = await this.generateJson<{ invoices?: unknown }>(model, {
      contents: [
        {
          parts: [
            { inlineData: { mimeType: file.mimeType, data: file.buffer.toString('base64') } },
            {
              text: [
                `Bu PDF ${pageCount} sayfadır ve birden fazla FATURA içerebilir.`,
                'Her faturanın hangi sayfada başlayıp hangi sayfada bittiğini belirle.',
                'Sayfa numaraları 1\'den başlar ve faturalar sırayla, boşluksuz olmalıdır:',
                'ilk fatura 1. sayfadan başlar, her fatura bir öncekinin bittiği sayfanın',
                'hemen ardından başlar, son fatura son sayfada biter.',
                'Her fatura için görebildiğin alanları da doldur; okuyamadığın alanı boş bırak.',
                'Tutarları nokta ondalık ayırıcı ile, binlik ayırıcı olmadan yaz (ör. 1234.56).',
                'Tarihleri YYYY-AA-GG biçiminde yaz (ör. 2026-07-15).',
              ].join(' '),
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            invoices: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  startPage: { type: 'INTEGER' },
                  endPage: { type: 'INTEGER' },
                  documentNo: { type: 'STRING' },
                  documentDate: { type: 'STRING' },
                  vknTckn: { type: 'STRING' },
                  counterpartyTitle: { type: 'STRING' },
                  totalAmount: { type: 'STRING' },
                  taxAmount: { type: 'STRING' },
                },
                required: ['startPage', 'endPage'],
              },
            },
          },
          required: ['invoices'],
        },
      },
    });

    if (!Array.isArray(parsed.invoices)) return [];
    const out: InvoiceSegmentDetection[] = [];
    for (const raw of parsed.invoices) {
      const r = raw as Record<string, unknown>;
      const startPage = Number(r.startPage);
      const endPage = Number(r.endPage);
      if (!Number.isInteger(startPage) || !Number.isInteger(endPage)) continue;
      out.push({
        startPage,
        endPage,
        documentNo: r.documentNo ? String(r.documentNo) : undefined,
        documentDate: r.documentDate ? String(r.documentDate) : undefined,
        vknTckn: r.vknTckn ? String(r.vknTckn) : undefined,
        counterpartyTitle: r.counterpartyTitle ? String(r.counterpartyTitle) : undefined,
        totalAmount: r.totalAmount ? String(r.totalAmount) : undefined,
        taxAmount: r.taxAmount ? String(r.taxAmount) : undefined,
      });
    }
    return out;
  }

  /**
   * Mali Hafıza Raporu görselinden çoklu-şerit/çoklu-gün çıkarımı. Tek bir fotoğrafta
   * yan yana birden fazla ayrı fiş şeridi olabilir (ör. farklı POS cihazlarına ait) —
   * her şerit kendi Z numaralı günlük satırlarını içerir. `extract()`'ten farklı olarak
   * tek düz obje değil, şerit dizisi (her biri kendi entry dizisiyle) döner.
   */
  async extractMaliHafiza(model: string, file: { buffer: Buffer; mimeType: string }): Promise<MaliHafizaExtractionResult> {
    const parsed = await this.generateJson<{ strips?: unknown; overallIssue?: unknown; confidence?: unknown }>(model, {
      contents: [
        {
          parts: [
            { inlineData: { mimeType: file.mimeType, data: file.buffer.toString('base64') } },
            { text: MALI_HAFIZA_PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: MALI_HAFIZA_RESPONSE_SCHEMA,
      },
    });

    const strips = Array.isArray(parsed.strips) ? parsed.strips.map(normalizeStrip).filter((s) => s.entries.length > 0) : [];
    const overallIssue = typeof parsed.overallIssue === 'string' && parsed.overallIssue.trim() ? parsed.overallIssue.trim() : undefined;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;

    return { strips, overallIssue, confidence };
  }
}

const MALI_HAFIZA_PROMPT = [
  'Ekteki görüntü bir veya daha fazla ayrı "MALİ HAFIZA RAPORU" fiş şeridi içerebilir — bunlar genelde yan yana',
  'fotoğraflanmış, farklı POS/yazar kasa cihazlarına (ör. "Manuel POS", "ÖKC P3") ait, birbirinden BAĞIMSIZ şeritlerdir.',
  'Her şeridin başında bir tarih aralığı (ör. "01/07/26-31/07/26 ARASI") ve altında art arda günlük satırlar bulunur;',
  'her satır "Z <no>" ve tarihiyle başlar, ardından "TOPLAM" (o günün toplam satış tutarı) ve "TOPKDV" (o günün',
  'toplam KDV tutarı) değerleri gelir.',
  '',
  'Görseldeki HER ŞERİDİ ayrı bir obje olarak, soldan sağa sırayla "strips" dizisine ekle. Bir şeridi diğeriyle',
  'ASLA birleştirme — farklı şeritlerin günlük satırlarını karıştırma.',
  'Her şerit için:',
  '- "label": şeridin üstünde el yazısı/başlık olarak görülen cihaz adı varsa aynen yaz (yoksa boş bırak).',
  '- "periodStart"/"periodEnd": şeridin üst kısmındaki tarih aralığı, YYYY-MM-DD formatında.',
  '- "readable": bu şerit BÜTÜN OLARAK yeterince net mi? Bulanıklık, düşük çözünürlük, ışık yansıması, kesilmiş/',
  '  kıvrılmış kağıt gibi nedenlerle rakamların önemli bir kısmı GÜVENLE okunamıyorsa false yaz.',
  '- "issue": readable false ise (veya kısmi bir sorun varsa) sorunu 1 kısa Türkçe cümleyle özetle (ör. "Fotoğraf',
  '  bulanık, çoğu rakam seçilemiyor.", "Şeridin alt kısmı kadraj dışında kalmış."). Sorun yoksa boş bırak.',
  '- "entries": şeritteki HER günlük Z satırı için bir obje: "documentNo" (Z numarası, ör. "0197"),',
  '  "documentDate" (YYYY-MM-DD), "totalAmount" (o günün TOPLAM değeri), "taxAmount" (o günün TOPKDV değeri),',
  '  "uncertain" (bu SATIRIN rakamlarından emin değilsen/tahmin ettiysen true, netse false).',
  '',
  'Tarihler DD/MM/YY biçiminde basılıdır ve yıl her zaman 2000\'li yıllardır (ör. "01/07/26" -> "2026-07-01").',
  'Tutarlar Türkçe biçimde binlik nokta, ondalık virgülle basılıdır (ör. "43.642,98") — bunu düz sayıya çevir (43642.98).',
  'Görselde HİÇ Mali Hafıza Raporu şeridi yoksa veya görsel tamamen kullanılamaz haldeyse (alakasız fotoğraf, tümüyle',
  'karanlık/bulanık vb.) "strips" dizisini boş bırak ve "overallIssue" alanına kısa bir Türkçe açıklama yaz.',
  '"confidence" alanına genel çıkarım güvenini 0 ile 1 arasında bir sayı olarak yaz — belge net/okunaklıysa 1\'e',
  'yakın, bulanık/eksikse düşük ver.',
].join('\n');

const MALI_HAFIZA_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    strips: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          label: { type: 'STRING' },
          periodStart: { type: 'STRING' },
          periodEnd: { type: 'STRING' },
          readable: { type: 'BOOLEAN' },
          issue: { type: 'STRING' },
          entries: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                documentNo: { type: 'STRING' },
                documentDate: { type: 'STRING' },
                totalAmount: { type: 'NUMBER' },
                taxAmount: { type: 'NUMBER' },
                uncertain: { type: 'BOOLEAN' },
              },
              required: ['documentNo', 'documentDate', 'totalAmount'],
            },
          },
        },
        required: ['entries', 'readable'],
      },
    },
    overallIssue: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
  },
  required: ['strips', 'confidence'],
};

function normalizeStrip(raw: unknown): MaliHafizaStripExtraction {
  const s = (raw ?? {}) as Record<string, unknown>;
  const rawEntries = Array.isArray(s.entries) ? s.entries : [];
  const entries = rawEntries.map(normalizeEntry).filter((e): e is MaliHafizaEntryExtraction => e !== null);
  const issue = typeof s.issue === 'string' && s.issue.trim() ? s.issue.trim() : undefined;
  // Model bazı satırları tamamen okunamaz JSON döndürüp normalizeEntry'de elenmiş olabilir —
  // bu durumda "readable:true" desin bile, düşen satır sayısı kendi başına bir netlik sorunudur.
  const droppedCount = rawEntries.length - entries.length;
  const readable = s.readable !== false && droppedCount === 0;
  return {
    label: typeof s.label === 'string' && s.label.trim() ? s.label.trim() : undefined,
    periodStart: typeof s.periodStart === 'string' ? s.periodStart.slice(0, 10) : undefined,
    periodEnd: typeof s.periodEnd === 'string' ? s.periodEnd.slice(0, 10) : undefined,
    readable,
    issue: issue ?? (droppedCount > 0 ? `${droppedCount} günlük satır okunamadığı için atlandı.` : undefined),
    entries,
  };
}

function normalizeEntry(raw: unknown): MaliHafizaEntryExtraction | null {
  const e = (raw ?? {}) as Record<string, unknown>;
  const documentNo = typeof e.documentNo === 'string' ? e.documentNo.trim() : '';
  const documentDate = typeof e.documentDate === 'string' ? e.documentDate.slice(0, 10) : '';
  const totalAmount = Number(e.totalAmount);
  if (!documentNo || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate) || Number.isNaN(totalAmount)) return null;
  const taxAmount = Number(e.taxAmount);
  return {
    documentNo,
    documentDate,
    totalAmount,
    taxAmount: Number.isNaN(taxAmount) ? 0 : taxAmount,
    uncertain: e.uncertain === true,
  };
}

function buildPrompt(fields: MetadataFieldDef[]): string {
  const fieldLines = fields
    .map((f) => `- ${f.key} ("${f.label}", tür: ${f.type}${f.options ? `, seçenekler: ${f.options.join('/')}` : ''})`)
    .join('\n');
  return [
    'Ekteki Türkçe muhasebe evrakının görüntüsünü/PDF\'ini incele ve aşağıdaki alanları JSON olarak çıkar.',
    'Alanlar:',
    fieldLines,
    '',
    'Tarih alanlarını YYYY-MM-DD formatında, ondalık (decimal) alanları nokta ayraçlı sayı olarak ver (ör. 1234.56).',
    'Emin olmadığın veya belgede bulamadığın alanları "uncertainFields" listesine ekle ve o alanı boş bırak.',
    '"confidence" alanına genel çıkarım güvenini 0 ile 1 arasında bir sayı olarak yaz — belge net/okunaklıysa 1\'e yakın, bulanık/eksikse düşük ver.',
  ].join('\n');
}

/** "YYYY-MM-DD" -> "MMYYYY" (örn. "2026-06-13" -> "062026"). */
function formatReceiptGroupNo(documentDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(documentDate);
  if (!match) return null;
  const [, year, month] = match;
  return `${month}${year}`;
}

function buildResponseSchema(fields: MetadataFieldDef[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === 'decimal') {
      properties[f.key] = { type: 'NUMBER' };
    } else if (f.type === 'enum' && f.options?.length) {
      properties[f.key] = { type: 'STRING', enum: f.options };
    } else {
      properties[f.key] = { type: 'STRING' };
    }
  }
  properties.confidence = { type: 'NUMBER' };
  properties.uncertainFields = { type: 'ARRAY', items: { type: 'STRING' } };

  return {
    type: 'OBJECT',
    properties,
    required: ['confidence'],
  };
}
