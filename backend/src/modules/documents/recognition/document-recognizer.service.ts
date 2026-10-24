import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PDFParse } from 'pdf-parse';
import { MetadataFieldDef } from '../../../database/entities/document-type.entity';
import { TaxpayerProfile } from '../../../database/entities/taxpayer-profile.entity';
import { DocumentTypesService } from '../../document-types/document-types.service';
import { AccessControlService } from '../../authorizations/access-control.service';
import { AuthUser } from '../../../common/types/auth-user';

export interface RecognizeResult {
  matched: boolean;
  documentTypeId?: number;
  documentTypeCode?: string;
  title?: string;
  metadata?: Record<string, string>;
}

interface RecognizableFile {
  buffer: Buffer;
  mimetype: string;
}

interface TypeSignal {
  code: string;
  patterns: RegExp[];
}

/**
 * Tür sınıflandırması normalize edilmiş (Türkçe karaktersiz, büyük harf) metin üzerinde
 * çalışır. Liste önce özgün ifadeleri (ör. "E-ARŞİV FATURA"), sonra genel olanları
 * içerir — en çok örüntü eşleşen tür kazanır, eşitlikte listede önce gelen kazanır.
 */
const TYPE_SIGNALS: TypeSignal[] = [
  { code: 'e_arsiv_fatura', patterns: [/E-?ARSIV FATURA/, /E-?ARSIV FATURASI/] },
  { code: 'e_fatura', patterns: [/\bE-?FATURA\b/, /UBL-?TR/] },
  { code: 'mali_hafiza', patterns: [/MALI HAFIZA/] },
  { code: 'e_defter', patterns: [/E-?DEFTER/, /YEVMIYE BERATI/, /KEBIR BERATI/, /\bBERAT\b/] },
  { code: 'tahsilat_makbuzu', patterns: [/TAHSILAT MAKBUZU/] },
  { code: 'tediye_makbuzu', patterns: [/TEDIYE MAKBUZU/] },
  { code: 'alinan_cek', patterns: [/ALINAN CEK/, /\bCEK\b.*ALINDI/] },
  { code: 'verilen_cek', patterns: [/VERILEN CEK/, /\bCEK\b.*VERILDI/] },
  { code: 'banka_ekstre', patterns: [/HESAP EKSTRESI/, /HESAP OZETI/] },
  { code: 'e_bordro', patterns: [/UCRET BORDROSU/, /\bBORDRO\b/] },
  { code: 'sigorta', patterns: [/SOSYAL GUVENLIK KURUMU/, /\bSGK\b/] },
  { code: 'imza_sirkusu', patterns: [/IMZA SIRKULERI/, /IMZA SIRKUSU/] },
  { code: 'vergi_levhasi', patterns: [/VERGI LEVHASI/] },
  { code: 'ticaret_sicil', patterns: [/TICARET SICIL GAZETESI/] },
];

/** Alan anahtarı → metin içinde aranacak etiket alternatifleri (normalize edilmiş, büyük harf). */
const FIELD_LABEL_ALIASES: Record<string, string[]> = {
  documentNo: ['FATURA NO', 'FATURA NUMARASI', 'MAKBUZ NO', 'BELGE NO', 'CEK NO', 'Z NO', 'FIS NO', 'YEVMIYE KONTROL NO', 'GAZETE NO', 'ETTN'],
  documentDate: ['FATURA TARIHI', 'DUZENLEME TARIHI', 'BERAT TARIHI', 'YAYIN TARIHI', 'TARIH'],
  issueDate: ['KESIDE TARIHI'],
  dueDate: ['VADE TARIHI', 'SON ODEME TARIHI'],
  validUntil: ['GECERLILIK TARIHI'],
  periodStart: ['DONEM BASLANGIC', 'DONEM BASLANGICI'],
  periodEnd: ['DONEM BITIS', 'DONEM SONU'],
  vknTckn: ['VKN/TCKN', 'VERGI KIMLIK NO', 'VKN', 'TC KIMLIK NO', 'T.C. KIMLIK NO', 'TCKN'],
  // NOT: 'ALICI'/'SATICI' burada YOK — bunlar bölüm başlığıdır ("Etiket: Değer" değil),
  // etiket-tabanlı armada eşleşirse başlığın hemen yanındaki alakasız metni yakalar.
  // Karşı taraf unvanı/VKN'si + yön, e-fatura/e-arşiv için VKN karşılaştırmasıyla ayrıca çözülür.
  counterpartyTitle: ['UNVAN', 'MUSTERI ADI', 'FIRMA UNVANI', 'BORCLU', 'ALACAKLI', 'CARI UNVAN'],
  totalAmount: ['GENEL TOPLAM', 'ODENECEK TUTAR', 'VERGILER DAHIL TOPLAM TUTAR', 'TOPLAM TUTAR', 'TUTAR'],
  taxAmount: ['HESAPLANAN KDV', 'TOPLAM KDV', 'KDV TUTARI'],
  currency: ['PARA BIRIMI'],
  iban: ['IBAN'],
  bank: ['BANKA ADI', 'BANKA'],
  bankName: ['BANKA ADI', 'BANKA'],
  branch: ['SUBE'],
  openingBalance: ['BASLANGIC BAKIYESI', 'DEVIR BAKIYESI'],
  closingBalance: ['BITIS BAKIYESI', 'KAPANIS BAKIYESI'],
  period: ['DONEM'],
  netSalary: ['NET UCRET', 'NET MAAS'],
  grossSalary: ['BRUT UCRET', 'BRUT MAAS'],
  personnelName: ['PERSONEL AD SOYAD', 'AD SOYAD'],
  personnelTc: ['TC KIMLIK NO', 'T.C. KIMLIK NO'],
  sgkRegNo: ['SGK SICIL NO', 'ISYERI SICIL NO'],
  deviceSerialNo: ['CIHAZ SICIL NO', 'CIHAZ SERI NO'],
  receiptGroupNo: ['FIS GRUP NO'],
  docKind: ['BELGE TURU'],
};

@Injectable()
export class DocumentRecognizerService {
  constructor(
    private readonly documentTypes: DocumentTypesService,
    private readonly access: AccessControlService,
    @InjectRepository(TaxpayerProfile) private readonly taxpayers: Repository<TaxpayerProfile>,
  ) {}

  /**
   * Yalnızca metin katmanlı PDF'lerde çalışır (taranmış görsel/foto evraklarda güvenilir
   * OCR olmadan tanıma yapılamaz — bu durumda kullanıcı manuel seçim yapar). Eşleşme
   * bulunamazsa ya da PDF metni çıkarılamazsa `matched:false` döner; hata fırlatmaz.
   */
  async recognize(user: AuthUser, taxpayerId: string | undefined, file: RecognizableFile): Promise<RecognizeResult> {
    if (file.mimetype !== 'application/pdf') return { matched: false };

    let text: string;
    const parser = new PDFParse({ data: file.buffer });
    try {
      const parsed = await parser.getText();
      text = parsed.text ?? '';
    } catch {
      return { matched: false };
    } finally {
      await parser.destroy().catch(() => undefined);
    }
    if (!text.trim()) return { matched: false };

    const norm = normalizeForMatch(text);
    const typeCode = classify(norm);
    if (!typeCode) return { matched: false };

    const types = await this.documentTypes.findAll();
    const type = types.find((t) => t.code === typeCode);
    if (!type) return { matched: false };

    const ownVkn = await this.resolveOwnVkn(user, taxpayerId);
    const metadata = extractFields(type.metadataSchema?.fields ?? [], text, norm, ownVkn);
    const title = metadata.documentNo ? `${type.name} ${metadata.documentNo}` : undefined;

    return { matched: true, documentTypeId: type.id, documentTypeCode: type.code, title, metadata };
  }

  /**
   * Alış/satış yönünü ve karşı tarafı belirlemek için mükellefin kendi VKN/TCKN'si.
   * Erişim yoksa veya taxpayerId verilmemişse sessizce `undefined` döner — yön tespiti
   * atlanır, kullanıcı manuel seçer (tanıma bu yüzden asla hata fırlatmaz).
   */
  private async resolveOwnVkn(user: AuthUser, taxpayerId: string | undefined): Promise<string | undefined> {
    if (!taxpayerId) return undefined;
    try {
      await this.access.assertTaxpayerAccess(user, taxpayerId);
    } catch {
      return undefined;
    }
    const tp = await this.taxpayers.findOne({ where: { id: taxpayerId } });
    return tp?.vknTckn;
  }
}

function classify(norm: string): string | undefined {
  let bestCode: string | undefined;
  let bestScore = 0;
  for (const signal of TYPE_SIGNALS) {
    const score = signal.patterns.filter((p) => p.test(norm)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCode = signal.code;
    }
  }
  return bestCode;
}

function extractFields(fields: MetadataFieldDef[], original: string, norm: string, ownVkn: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of fields) {
    const value = extractFieldValue(field, original, norm);
    if (value !== undefined && value !== '') out[field.key] = value;
  }

  // Faturalarda (direction alanı olan tek tür) etiket-tabanlı tahmin yerine — mükellefin
  // kendi VKN'si biliniyorsa — belgedeki VKN konumlarını karşılaştırarak yön + karşı taraf
  // belirlenir. Bu, "SATICI"/"ALICI" başlıklarının metin çıkarımında nerede/nasıl
  // göründüğüne bağlı kalmadığı için etiket eşleşmesinden çok daha güvenilirdir.
  if (fields.some((f) => f.key === 'direction') && ownVkn) {
    const dc = resolveDirectionAndCounterparty(original, norm, ownVkn);
    if (dc) {
      out.direction = dc.direction;
      out.vknTckn = dc.vknTckn;
      if (dc.counterpartyTitle) out.counterpartyTitle = dc.counterpartyTitle;
    }
  }

  return out;
}

function extractFieldValue(field: MetadataFieldDef, original: string, norm: string): string | undefined {
  if (field.key === 'direction') return undefined; // bkz. extractFields — VKN karşılaştırmasıyla ayrıca çözülür
  if (field.key === 'txnType') return detectTxnType(norm);
  if (field.key === 'beratType') return detectBeratType(norm);

  const aliases = [...(FIELD_LABEL_ALIASES[field.key] ?? []), normalizeForMatch(field.label)];
  const region = findValueRegion(original, norm, aliases);
  if (!region) return undefined;

  if (field.key === 'vknTckn' || field.key === 'personnelTc' || field.key === 'sgkRegNo') {
    return parseDigitsValue(region);
  }
  if (field.key === 'iban') return parseIbanValue(region);

  switch (field.type) {
    case 'date':
      return parseDateValue(region);
    case 'decimal':
      return parseDecimalValue(region);
    case 'enum':
      return undefined;
    default:
      return parseStringValue(region);
  }
}

/** Türkçe büyük/küçük harf kurallarıyla büyütür, ardından aksanlı harfleri ASCII eşine indirger (uzunluk korunur). */
function normalizeForMatch(s: string): string {
  return s
    .toLocaleUpperCase('tr-TR')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/İ/g, 'I');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Türkçe etiketler çoğunlukla iyelik eki alır (Unvan→Unvanı, Tutar→Tutarı). Aliaslar kök
// haliyle yazılıyor; eşleşmenin bitiş konumu bu eki de yutar — aksi halde region "I: ..."
// gibi artık bir harfle başlar ve değeri kirletir (ör. Unvan tespitinin boş/anlamsız çıkması).
function buildAliasRegex(alias: string): RegExp {
  const parts = alias.split(' ').filter(Boolean).map(escapeRegex);
  return new RegExp(`${parts.join('\\s+')}(?:S?I|S?İ)?`);
}

/** Normalize metinde etiketi bulur, ORİJİNAL metinden (aksan/büyük-küçük harf korunarak) sonrasını döner. */
function findValueRegion(original: string, norm: string, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    if (!alias) continue;
    const m = norm.match(buildAliasRegex(alias));
    if (m && m.index !== undefined) {
      const end = m.index + m[0].length;
      return original.slice(end, end + 100);
    }
  }
  return undefined;
}

function parseStringValue(region: string): string | undefined {
  let v = region.replace(/^[\s:.\-]+/, '');
  v = v.split(/\n/)[0];
  v = v.split(/\s{2,}/)[0];
  v = v.trim();
  if (!v) return undefined;
  return v.length > 80 ? v.slice(0, 80).trim() : v;
}

function parseDateValue(region: string): string | undefined {
  const iso = region.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const m = region.match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);
  if (!m) return undefined;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  if (Number(day) > 31 || Number(month) > 12) return undefined;
  return `${year}-${month}-${day}`;
}

/**
 * Türk e-fatura özetlerinde etiketin hemen ardından çoğu zaman KDV/iskonto ORANI
 * parantez içinde gelir (ör. "Hesaplanan KDV (%20) : 246,80") — asıl tutar ondan
 * SONRA gelir. Bölgedeki tüm sayı adaylarını toplayıp `%` bitişiklilerini eler,
 * ondalıklı (virgül/nokta ayraçlı) olanı tercih eder; aksi halde ilk adaya döner.
 */
function parseDecimalValue(region: string): string | undefined {
  const re = /-?\d{1,3}(?:\.\d{3})*,\d{1,2}|-?\d+[.,]\d{1,2}|-?\d+/g;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(region))) {
    const before = region[m.index - 1];
    const after = region[m.index + m[0].length];
    if (before === '%' || after === '%') continue;
    if (before === '(' && after === ')') continue;
    candidates.push(m[0]);
  }
  const chosen = candidates.find((c) => /[.,]/.test(c)) ?? candidates[0];
  if (!chosen) return undefined;
  let raw = chosen;
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n.toFixed(2);
}

function parseDigitsValue(region: string): string | undefined {
  const m = region.match(/\d{10,11}/);
  return m ? m[0] : undefined;
}

function parseIbanValue(region: string): string | undefined {
  const m = region.match(/TR\d{2}\s?(?:\d{4}\s?){5}\d{2}/i);
  return m ? m[0].replace(/\s+/g, '').toUpperCase() : undefined;
}

interface DirectionResult {
  direction: string;
  vknTckn: string;
  counterpartyTitle?: string;
}

/**
 * Faturanın metninde SATICI/ALICI bölüm başlıklarına güvenmek yerine, mükellefin kendi
 * VKN/TCKN'sinin belgede geçtiği yere bakar. Standart GİB e-Fatura/e-Arşiv şablonunda
 * SATICI bilgisi ALICI'dan önce basılır: kendi VKN'miz metinde karşı tarafınkinden ÖNCE
 * geçiyorsa satış, SONRA geçiyorsa alış faturasıdır.
 */
function resolveDirectionAndCounterparty(original: string, norm: string, ownVkn: string): DirectionResult | undefined {
  const seen = new Map<string, number>();
  const re = /\b\d{10,11}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm))) {
    if (!seen.has(m[0])) seen.set(m[0], m.index);
  }
  const ownIndex = seen.get(ownVkn);
  if (ownIndex === undefined) return undefined;

  const others = [...seen.entries()].filter(([vkn]) => vkn !== ownVkn).sort((a, b) => a[1] - b[1]);
  if (!others.length) return undefined;
  const [counterpartyVkn, counterpartyIndex] = others[0];

  const direction = ownIndex < counterpartyIndex ? 'satis' : 'alis';
  const counterpartyTitle = guessCompanyTitleNear(original, counterpartyIndex);

  return { direction, vknTckn: counterpartyVkn, counterpartyTitle };
}

/**
 * VKN'nin bloğuna ait Türkçe şirket unvanı ekli (LTD, A.Ş, TİC vb.) satırı arar. Fatura
 * bloklarında etiket her zaman kimlik numarasından ÖNCE basılır ("Unvanı: X" sonra
 * "VKN: Y") — bu yüzden VKN'den hemen ÖNCEki eşleşen satır tercih edilir; yalnızca
 * mutlak uzaklık kullanmak komşu bloğun (ör. bir sonraki taraf) satırını yanlışlıkla
 * seçebilir çünkü "Unvanı:" etiketi + şirket adı kendi VKN'sinden daha uzakta kalabilir.
 */
function guessCompanyTitleNear(original: string, vknIndex: number): string | undefined {
  const suffixRe = /(LTD|ŞTİ|STI|A\.?Ş|TİC|SAN|LİMİTED|ANONİM)/i;
  const windowStart = Math.max(0, vknIndex - 200);
  const windowEnd = Math.min(original.length, vknIndex + 200);

  let cursor = windowStart;
  let lastBefore: string | undefined;
  let firstAfter: string | undefined;
  for (const rawLine of original.slice(windowStart, windowEnd).split('\n')) {
    const lineStart = cursor;
    cursor += rawLine.length + 1;
    const line = rawLine.trim();
    if (!line || !suffixRe.test(line)) continue;
    if (lineStart <= vknIndex) lastBefore = line;
    else if (firstAfter === undefined) firstAfter = line;
  }
  const hit = lastBefore ?? firstAfter;
  if (!hit) return undefined;

  const colonIdx = hit.indexOf(':');
  const cleaned = colonIdx > 0 && colonIdx <= 20 ? hit.slice(colonIdx + 1).trim() : hit;
  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

function detectTxnType(norm: string): string | undefined {
  if (/\bNAKIT\b/.test(norm)) return 'nakit';
  if (/\bHAVALE\b/.test(norm)) return 'havale';
  if (/\bEFT\b/.test(norm)) return 'eft';
  return undefined;
}

function detectBeratType(norm: string): string | undefined {
  if (/YEVMIYE/.test(norm)) return 'yevmiye';
  if (/KEBIR/.test(norm)) return 'kebir';
  return undefined;
}
