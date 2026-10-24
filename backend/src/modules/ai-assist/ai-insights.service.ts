import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document, DocumentType } from '../../database/entities';
import { DocumentStatus } from '../../shared/enums';
import { formatDateTr } from '../../shared/format-date';

export type InsightSeverity = 'critical' | 'warning' | 'info';

export interface Insight {
  /** Arayüzün gruplayıp ikon seçebilmesi için makine okunur tür. */
  code: 'missing_period' | 'document_no_gap' | 'undigitized_backlog' | 'unusual_amount' | 'repeated_amount' | 'quiet_taxpayer';
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** Varsa ilgili evrak id'leri — arayüz doğrudan o kayıtlara götürür. */
  documentIds?: string[];
}

/** Medyanın bu katından büyük tutarlar "olağandışı" sayılır. */
const UNUSUAL_MULTIPLIER = 8;
/** Fatura no dizisinde bu kadar büyük bir boşluk "atlanmış belge" sinyali sayılır. */
const MAX_REPORTED_GAPS = 5;
/** Kaç aylık geçmişe bakılır. */
const LOOKBACK_MONTHS = 6;

/**
 * Evrak akışındaki anormallikleri bulur.
 *
 * Tespit tamamen DETERMİNİSTİK'tir — yapay zeka kullanılmaz. Bunlar sayılabilir,
 * kesin olarak doğrulanabilir olgular (atlanan fatura numarası, evraksız ay, medyanın
 * çok üstünde tutar); bir dil modeline sordurmak hem pahalı hem de yanlış cevap
 * üretmeye açık olurdu. Yapay zeka yalnızca bu olguları kullanıcıya ANLATIRKEN
 * devreye girer (bkz. AiAssistService.summarize) ve kapalıysa bulgular ham hâliyle
 * gösterilmeye devam eder.
 */
@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);

  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(DocumentType) private readonly types: Repository<DocumentType>,
  ) {}

  async detect(taxpayerId: string): Promise<Insight[]> {
    const since = new Date();
    since.setMonth(since.getMonth() - LOOKBACK_MONTHS);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const rows = await this.documents.find({
      where: { taxpayerId, status: DocumentStatus.ACTIVE },
      select: ['id', 'documentTypeId', 'documentDate', 'metaDocNo', 'metaAmount', 'isDigitized', 'createdAt', 'title'],
      order: { documentDate: 'ASC' },
      take: 5000,
    });
    if (!rows.length) return [];

    const typeNames = new Map((await this.types.find()).map((t) => [t.id, t.name]));
    const insights: Insight[] = [];

    // --- Alanları eksik evrak birikmesi -------------------------------------
    const undigitized = rows.filter((r) => !r.isDigitized);
    if (undigitized.length >= 5) {
      insights.push({
        code: 'undigitized_backlog',
        severity: undigitized.length >= 25 ? 'critical' : 'warning',
        title: `${undigitized.length} evrağın alanları eksik`,
        detail: 'Alanları doldurulmayan evraklar listelerde filtrelenemez ve KDV hesabına girmez.',
        documentIds: undigitized.slice(0, 20).map((r) => r.id),
      });
    }

    // --- Hiç evrak gelmeyen ay ---------------------------------------------
    const monthsWithDocs = new Set(
      rows.filter((r) => r.documentDate).map((r) => String(r.documentDate).slice(0, 7)),
    );
    const missingMonths: string[] = [];
    const cursor = new Date(since);
    const now = new Date();
    while (cursor < now) {
      const key = cursor.toISOString().slice(0, 7);
      // İçinde bulunulan ay henüz tamamlanmadığı için "eksik" sayılmaz.
      if (key !== now.toISOString().slice(0, 7) && !monthsWithDocs.has(key)) missingMonths.push(key);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (missingMonths.length) {
      insights.push({
        code: 'missing_period',
        severity: 'warning',
        title: `${missingMonths.length} ayda hiç evrak yok`,
        detail: `Şu dönemlerde kayıt bulunamadı: ${missingMonths.join(', ')}.`,
      });
    }

    // --- Fatura numarası dizisinde atlama ----------------------------------
    // Aynı ön ek (ör. "ABC2026") altındaki sayısal kuyruklar sıralanır; ardışık
    // olmayanlar "atlanmış belge" adayıdır. Ön ek bazlı bakılır, çünkü farklı
    // seri/yıl önekleri birbirini takip etmez.
    const byPrefix = new Map<string, number[]>();
    for (const r of rows) {
      const no = r.metaDocNo?.trim();
      if (!no) continue;
      const m = /^(.*?)(\d{3,})$/.exec(no);
      if (!m) continue;
      const list = byPrefix.get(m[1]) ?? [];
      list.push(Number(m[2]));
      byPrefix.set(m[1], list);
    }
    const gaps: string[] = [];
    for (const [prefix, numbers] of byPrefix) {
      if (numbers.length < 3) continue;
      const sorted = [...new Set(numbers)].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length && gaps.length < MAX_REPORTED_GAPS; i += 1) {
        const diff = sorted[i] - sorted[i - 1];
        // Çok büyük sıçramalar genelde seri değişimidir, sinyal değil.
        if (diff > 1 && diff <= 20) {
          gaps.push(diff === 2
            ? `${prefix}${sorted[i - 1] + 1}`
            : `${prefix}${sorted[i - 1] + 1} – ${prefix}${sorted[i] - 1}`);
        }
      }
    }
    if (gaps.length) {
      insights.push({
        code: 'document_no_gap',
        severity: 'warning',
        title: `${gaps.length} belge numarası atlanmış görünüyor`,
        detail: `Eksik olabilecek numaralar: ${gaps.join(', ')}.`,
      });
    }

    // --- Olağandışı tutar ---------------------------------------------------
    const amounts = rows
      .map((r) => Number(r.metaAmount))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    if (amounts.length >= 10) {
      const median = amounts[Math.floor(amounts.length / 2)];
      const threshold = median * UNUSUAL_MULTIPLIER;
      const outliers = rows.filter((r) => Number(r.metaAmount) > threshold);
      if (outliers.length && outliers.length <= 10) {
        insights.push({
          code: 'unusual_amount',
          severity: 'info',
          title: `${outliers.length} evrakta olağandışı yüksek tutar`,
          detail: `Ortanca tutarın ${UNUSUAL_MULTIPLIER} katından büyük kayıtlar — yanlış girilmiş bir rakam olabilir.`,
          documentIds: outliers.map((r) => r.id),
        });
      }
    }

    // --- Aynı tutarın aynı gün tekrarı --------------------------------------
    // Birebir aynı DOSYA zaten yüklenemez (checksum kontrolü); buradaki sinyal
    // "aynı fatura farklı dosya olarak iki kez girilmiş" olasılığıdır.
    const seen = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.metaAmount || !r.documentDate) continue;
      const key = `${r.documentTypeId}|${r.documentDate}|${r.metaAmount}`;
      const list = seen.get(key) ?? [];
      list.push(r.id);
      seen.set(key, list);
    }
    const repeats = [...seen.entries()].filter(([, ids]) => ids.length > 1);
    if (repeats.length) {
      const first = repeats[0][0].split('|');
      insights.push({
        code: 'repeated_amount',
        severity: 'info',
        title: `${repeats.length} tutar aynı gün birden fazla kez kayıtlı`,
        detail: `Örnek: ${typeNames.get(Number(first[0])) ?? 'Evrak'} · ${first[1]} · ${first[2]} ₺.`,
        documentIds: repeats.flatMap(([, ids]) => ids).slice(0, 20),
      });
    }

    // --- Uzun süredir evrak gelmemiş ----------------------------------------
    const lastCreated = rows.reduce<Date | null>(
      (acc, r) => (!acc || r.createdAt > acc ? r.createdAt : acc), null,
    );
    if (lastCreated && Date.now() - lastCreated.getTime() > 30 * 24 * 60 * 60 * 1000) {
      insights.push({
        code: 'quiet_taxpayer',
        severity: 'warning',
        title: 'Bir aydır yeni evrak yüklenmemiş',
        detail: `Son yükleme: ${formatDateTr(lastCreated)}.`,
      });
    }

    const order: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2 };
    return insights.sort((a, b) => order[a.severity] - order[b.severity]);
  }
}
