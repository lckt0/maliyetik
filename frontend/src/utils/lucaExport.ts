// xlsx 0.18.5, npm'e yayınlanmış son sürümdür ve ayrıştırıcısında giderilmemiş
// prototype-pollution (CVE-2023-30533) + ReDoS açıkları vardır. Burada yalnızca YAZMA
// (XLSX.write) kullanıldığı için bu açıklar erişilebilir değil. Bir gün Luca içe
// aktarımı eklenirse XLSX.read'i bu sürümle güvenilmeyen dosyada ÇAĞIRMAYIN; önce
// SheetJS'in kendi dağıtımına geçin:
//   npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
import * as XLSX from 'xlsx';
import { DocumentRow, LucaAccountCodes } from '../types';
import { triggerBlobDownload } from './download';
import { isoToDisplay } from './date';

/**
 * Luca'nın genel "Fiş Aktarım" toplu içe aktarım şablonunun sütun sırası — kullanıcının
 * paylaştığı `fis_aktarim_sablon.xlsx` şablonundan birebir alındı. Sütun sırası değişirse
 * Luca içe aktarımı satırları yanlış alanlara okur, bu yüzden burada sabit tutulur.
 */
const LUCA_HEADER = [
  'Fiş No', 'Fiş Tarihi', 'Fiş Açıklama', 'Hesap Kodu', 'Evrak No', 'Evrak Tarihi',
  'Detay Açıklama', 'Borç', 'Alacak', 'Miktar', 'Belge Türü', 'Para Birimi', 'Kur', 'Döviz Tutar',
];

export interface ZRaporuTotals {
  cash: number;
  creditCard: number;
  mealCard: number;
  vat0Sales: number;
  vat10Sales: number;
  vat10Tax: number;
  vat20Sales: number;
  vat20Tax: number;
}

function metaNumber(metadata: Record<string, unknown> | undefined, key: string): number {
  const v = metadata?.[key];
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function metaString(metadata: Record<string, unknown> | undefined, key: string): string {
  const v = metadata?.[key];
  return v == null ? '' : String(v).trim();
}

/** Tek bir Z-Raporu kaydının alan bazlı tutarları. */
export function zRaporuTotals(doc: DocumentRow): ZRaporuTotals {
  return {
    cash: metaNumber(doc.metadata, 'cashAmount'),
    creditCard: metaNumber(doc.metadata, 'creditCardAmount'),
    mealCard: metaNumber(doc.metadata, 'mealCardAmount'),
    vat0Sales: metaNumber(doc.metadata, 'vat0SalesAmount'),
    vat10Sales: metaNumber(doc.metadata, 'vat10SalesAmount'),
    vat10Tax: metaNumber(doc.metadata, 'vat10TaxAmount'),
    vat20Sales: metaNumber(doc.metadata, 'vat20SalesAmount'),
    vat20Tax: metaNumber(doc.metadata, 'vat20TaxAmount'),
  };
}

export interface LucaJournalLine {
  amount: number;
  hesapKodu: string | null | undefined;
  label: string;
  side: 'borc' | 'alacak';
  /** Satırın geldiği Z-Raporu'nun Z No'su → Luca "Evrak No" sütunu. */
  evrakNo: string;
  /** Satırın geldiği Z-Raporu'nun tarihi (gg.aa.yyyy) → Luca "Evrak Tarihi" sütunu. */
  evrakTarihi: string;
}

/** Bir Z-Raporu'nun tutarlarından hangi hesap kodunun hangi tarafa yazılacağını tanımlar. */
function lineTemplate(totals: ZRaporuTotals, settings: LucaAccountCodes) {
  return [
    { amount: totals.cash, hesapKodu: settings.lucaKasaHesapKodu, label: 'Kasa - Nakit Tahsilat', side: 'borc' as const },
    { amount: totals.creditCard, hesapKodu: settings.lucaKrediKartiHesapKodu, label: 'Kredi Kartı Tahsilat', side: 'borc' as const },
    { amount: totals.mealCard, hesapKodu: settings.lucaYemekKartiHesapKodu, label: 'Yemek Kartı Tahsilat', side: 'borc' as const },
    { amount: totals.vat0Sales, hesapKodu: settings.lucaKdv0ToplamHesapKodu, label: "%0 KDV'li Satış Toplamı", side: 'alacak' as const },
    { amount: totals.vat10Sales, hesapKodu: settings.lucaKdv10ToplamHesapKodu, label: "%10 KDV'li Satış Toplamı", side: 'alacak' as const },
    { amount: totals.vat10Tax, hesapKodu: settings.lucaKdv10HesaplananHesapKodu, label: '%10 Hesaplanan KDV', side: 'alacak' as const },
    { amount: totals.vat20Sales, hesapKodu: settings.lucaKdv20ToplamHesapKodu, label: "%20 KDV'li Satış Toplamı", side: 'alacak' as const },
    { amount: totals.vat20Tax, hesapKodu: settings.lucaKdv20HesaplananHesapKodu, label: '%20 Hesaplanan KDV', side: 'alacak' as const },
  ];
}

/**
 * Fiş grubunun TEK muhasebe fişi satırlarını, grup toplamından değil **gruptaki her
 * Z-Raporu'ndan ayrı ayrı** üretir: her Z-Raporu kendi Evrak No (Z No) ve Evrak Tarihi
 * ile kendi satır kümesini yazar. Böylece Luca'da fiş tek kalırken hangi tutarın hangi
 * güne/Z raporuna ait olduğu kaybolmaz.
 *
 * Tutarı sıfır olan kalemler atlanır. Kalan satırlardan hesap kodu tanımsız olanların
 * etiketleri `missingLabels`'da (tekilleştirilmiş) döner; çağıran taraf bunları
 * göstererek dışa aktarımı Hesap Kodları ayarlanana kadar engellemeli.
 */
export function planLucaLines(docs: DocumentRow[], settings: LucaAccountCodes): { lines: LucaJournalLine[]; missingLabels: string[] } {
  const ordered = [...docs].sort((a, b) => {
    const da = a.documentDate ?? '';
    const db = b.documentDate ?? '';
    if (da !== db) return da < db ? -1 : 1;
    return (a.metaDocNo ?? '').localeCompare(b.metaDocNo ?? '', 'tr');
  });

  const lines: LucaJournalLine[] = [];
  for (const doc of ordered) {
    const evrakNo = doc.metaDocNo || metaString(doc.metadata, 'documentNo');
    const evrakTarihi = isoToDisplay(doc.documentDate ?? metaString(doc.metadata, 'documentDate')) || '';
    for (const c of lineTemplate(zRaporuTotals(doc), settings)) {
      if (Math.round(c.amount * 100) === 0) continue;
      lines.push({ ...c, evrakNo, evrakTarihi });
    }
  }

  const missingLabels = [...new Set(lines.filter((l) => !l.hesapKodu).map((l) => l.label))];
  return { lines, missingLabels };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Fişin borç/alacak dengesi — Luca dengesiz fişi içe almaz, dışa aktarmadan önce uyarılır. */
export function lineBalance(lines: LucaJournalLine[]): { borc: number; alacak: number; balanced: boolean } {
  let borc = 0;
  let alacak = 0;
  for (const l of lines) {
    if (l.side === 'borc') borc += l.amount;
    else alacak += l.amount;
  }
  return { borc: round2(borc), alacak: round2(alacak), balanced: Math.round((borc - alacak) * 100) === 0 };
}

/**
 * Fiş grubunu TEK muhasebe fişi olarak Luca'nın "Fiş Aktarım" şablonuna uygun bir .xlsx
 * dosyasına yazıp indirir — Fiş No = fiş grubu no, Fiş Tarihi = grubun son günü; satırlar
 * ise gruptaki Z-Raporları bazında ayrışır (Evrak No = Z No, Evrak Tarihi = Z tarihi).
 */
export function downloadLucaWorkbook(groupNo: string, fisTarihi: string, lines: LucaJournalLine[], settings: LucaAccountCodes): void {
  const belgeTuru = settings.lucaBelgeTuru ?? '';
  const rows = lines.map((l) => [
    groupNo,
    fisTarihi,
    `Z-Raporu Fiş Grubu ${groupNo}`,
    l.hesapKodu ?? '',
    l.evrakNo,
    l.evrakTarihi || fisTarihi,
    l.evrakNo ? `${l.evrakNo} — ${l.label}` : l.label,
    l.side === 'borc' ? round2(l.amount) : '',
    l.side === 'alacak' ? round2(l.amount) : '',
    '',
    belgeTuru,
    'TL',
    1,
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([LUCA_HEADER, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Fiş Aktarım');
  const out: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerBlobDownload(blob, `Luca-Fis-Aktarim-${groupNo.replace(/[^\w.-]+/g, '_')}.xlsx`);
}
