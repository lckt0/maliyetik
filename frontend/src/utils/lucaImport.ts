import JSZip from 'jszip';

export interface LucaParsedDocument {
  ettn: string;
  documentTypeCode: 'e_arsiv_fatura' | 'e_fatura';
  htmlBlob: Blob;
  metadata: {
    documentNo: string;
    documentDate: string;
    direction: 'alis' | 'satis';
    vknTckn: string;
    counterpartyTitle: string;
    totalAmount: string;
    taxAmount: string;
    currency: string;
  };
  /** Ayrıştırma başarısızsa hata mesajı — bu satır önizlemede işaretlenir, içe aktarıma dahil edilmez. */
  error?: string;
}

/** Doğrudan alt öğe (namespace önekiyle) — UBL XML'i tek seviye derin gezinti için. */
function child(el: Element | undefined, tag: string): Element | undefined {
  if (!el) return undefined;
  return Array.from(el.children).find((c) => c.tagName === tag);
}

function children(el: Element | undefined, tag: string): Element[] {
  if (!el) return [];
  return Array.from(el.children).filter((c) => c.tagName === tag);
}

function text(el: Element | undefined): string {
  return el?.textContent?.trim() ?? '';
}

/** `cac:PartyIdentification` listesinden VKN veya TCKN şemalı olanı bulur. */
function findTaxId(party: Element | undefined): string {
  for (const pid of children(party, 'cac:PartyIdentification')) {
    const idEl = child(pid, 'cbc:ID');
    const scheme = idEl?.getAttribute('schemeID');
    if (scheme === 'VKN' || scheme === 'TCKN') return text(idEl);
  }
  return '';
}

/** Kurumsal unvan (`cac:PartyName/cbc:Name`) veya gerçek kişi ad-soyad (`cac:Person`) fallback. */
function findPartyTitle(party: Element | undefined): string {
  const name = text(child(child(party, 'cac:PartyName'), 'cbc:Name'));
  if (name) return name;
  const person = child(party, 'cac:Person');
  if (person) {
    const first = text(child(person, 'cbc:FirstName'));
    const last = text(child(person, 'cbc:FamilyName'));
    return [first, last].filter(Boolean).join(' ');
  }
  return '';
}

export interface RawInvoice {
  ettn: string;
  documentTypeCode: 'e_arsiv_fatura' | 'e_fatura';
  documentNo: string;
  documentDate: string;
  supplierVkn: string;
  customerVkn: string;
  supplierTitle: string;
  customerTitle: string;
  totalAmount: string;
  taxAmount: string;
  currency: string;
}

export interface RawLucaEntry {
  baseName: string;
  raw?: RawInvoice;
  htmlBlob?: Blob;
  error?: string;
}

/** Belgeyi ayrıştırır — alış/satış yönüne karar vermez (bkz. `resolveLucaDocuments`). */
function parseInvoiceXml(xml: string): RawInvoice {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML ayrıştırılamadı.');
  const root = doc.documentElement;

  const ettn = text(child(root, 'cbc:UUID'));
  const documentNo = text(child(root, 'cbc:ID'));
  const documentDate = text(child(root, 'cbc:IssueDate'));
  const profileId = text(child(root, 'cbc:ProfileID'));
  const currency = text(child(root, 'cbc:DocumentCurrencyCode')) || 'TRY';
  const documentTypeCode = profileId === 'EARSIVFATURA' ? 'e_arsiv_fatura' : 'e_fatura';

  const supplierParty = child(child(root, 'cac:AccountingSupplierParty'), 'cac:Party');
  const customerParty = child(child(root, 'cac:AccountingCustomerParty'), 'cac:Party');
  const supplierVkn = findTaxId(supplierParty);
  const customerVkn = findTaxId(customerParty);

  let taxAmount = 0;
  for (const taxTotal of children(root, 'cac:TaxTotal')) {
    taxAmount += Number(text(child(taxTotal, 'cbc:TaxAmount'))) || 0;
  }
  const totalAmount = text(child(child(root, 'cac:LegalMonetaryTotal'), 'cbc:PayableAmount'));

  if (!documentNo || !documentDate || !totalAmount) {
    throw new Error('Zorunlu alanlardan biri (fatura no, tarih, tutar) belgede bulunamadı.');
  }

  return {
    ettn,
    documentTypeCode,
    documentNo,
    documentDate,
    supplierVkn,
    customerVkn,
    supplierTitle: findPartyTitle(supplierParty),
    customerTitle: findPartyTitle(customerParty),
    totalAmount,
    taxAmount: taxAmount.toFixed(2),
    currency,
  };
}

/**
 * Luca'dan indirilmiş zip arşivini (dış zip → GUID adlı iç zip'ler, her biri xml+html
 * çifti) tamamen istemci tarafında ayrıştırır — yön kararı vermeden ham veriyi döner.
 * Yön tespiti ayrı bir adımdır (bkz. `findVknCandidates` / `resolveLucaDocuments`) çünkü
 * doğru sonuç için hangi VKN'nin "kendi şirketiniz" olduğunun kesin şekilde bilinmesi
 * gerekir — tahmine dayalı sezgisel yöntemler, arşiv hem alış hem satış içerdiğinde
 * (gerçek bir muhasebe dışa aktarımında normal) yanlış sonuç üretebiliyordu.
 */
export async function parseLucaZipRaw(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<RawLucaEntry[]> {
  const outer = await JSZip.loadAsync(file);
  const innerEntries = Object.values(outer.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith('.zip'));
  if (!innerEntries.length) {
    throw new Error('Bu zip içinde Luca fatura arşivi (iç zip dosyaları) bulunamadı. Luca\'dan indirdiğiniz arşivi olduğu gibi seçin.');
  }
  onProgress?.(0, innerEntries.length);

  const entries: RawLucaEntry[] = [];
  for (const entry of innerEntries) {
    const baseName = entry.name.replace(/\.zip$/i, '');
    try {
      const innerBytes = await entry.async('arraybuffer');
      const inner = await JSZip.loadAsync(innerBytes);
      const xmlFile = inner.file(new RegExp(`${escapeRegex(baseName)}\\.xml$`, 'i'))[0] ?? inner.file(/\.xml$/i)[0];
      const htmlFile = inner.file(new RegExp(`${escapeRegex(baseName)}\\.html?$`, 'i'))[0] ?? inner.file(/\.html?$/i)[0];
      if (!xmlFile || !htmlFile) throw new Error('Zip içinde xml/html çifti bulunamadı.');

      const xml = await xmlFile.async('string');
      const htmlBlob = await htmlFile.async('blob');
      entries.push({ baseName, raw: parseInvoiceXml(xml), htmlBlob });
    } catch (err) {
      entries.push({ baseName, error: err instanceof Error ? err.message : 'Bilinmeyen hata.' });
    }
    onProgress?.(entries.length, innerEntries.length);
    // Büyük arşivlerde (binlerce fatura) döngü tek blokta çalışırsa tarayıcı donar ve
    // ilerleme çubuğu hiç boyanmaz — her belgede olay döngüsüne yer açıyoruz.
    if (entries.length % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return entries;
}

/** `ownVkn` arşivdeki herhangi bir belgede satıcı veya alıcı olarak geçiyor mu. */
export function ownVknFoundInArchive(entries: RawLucaEntry[], ownVkn: string): boolean {
  if (!ownVkn) return false;
  return entries.some(({ raw }) => raw && (raw.supplierVkn === ownVkn || raw.customerVkn === ownVkn));
}

export interface VknCandidate {
  vkn: string;
  title: string;
  supplierCount: number;
  customerCount: number;
}

/**
 * Sistemdeki VKN kaydı arşivle eşleşmediğinde ("vkn ile uyuşmuyor") kullanıcıya
 * seçtirmek için — arşivde geçen VKN'leri toplam geçiş sayısına göre sıralar. Bu VKN'ler
 * arasından "kendi şirketiniz"i kullanıcı SEÇER; sıklığa göre otomatik/sessiz bir tahmin
 * yapılmaz — arşiv gerçekten hem alış hem satış içerdiğinde (normal bir muhasebe dışa
 * aktarımı) tek bir "baskın" VKN varsayımı yanlış sonuç üretebiliyordu.
 */
export function findVknCandidates(entries: RawLucaEntry[], limit = 6): VknCandidate[] {
  const map = new Map<string, VknCandidate>();
  function bump(vkn: string, title: string, role: 'supplier' | 'customer') {
    if (!vkn) return;
    let c = map.get(vkn);
    if (!c) {
      c = { vkn, title: title || vkn, supplierCount: 0, customerCount: 0 };
      map.set(vkn, c);
    }
    if (role === 'supplier') c.supplierCount += 1; else c.customerCount += 1;
    if (!c.title && title) c.title = title;
  }
  for (const { raw } of entries) {
    if (!raw) continue;
    bump(raw.supplierVkn, raw.supplierTitle, 'supplier');
    bump(raw.customerVkn, raw.customerTitle, 'customer');
  }
  return [...map.values()]
    .sort((a, b) => (b.supplierCount + b.customerCount) - (a.supplierCount + a.customerCount))
    .slice(0, limit);
}

function errorDoc(baseName: string, message: string): LucaParsedDocument {
  return {
    ettn: baseName,
    documentTypeCode: 'e_arsiv_fatura',
    htmlBlob: new Blob(),
    metadata: {
      documentNo: '', documentDate: '', direction: 'satis', vknTckn: '', counterpartyTitle: '',
      totalAmount: '', taxAmount: '', currency: 'TRY',
    },
    error: message,
  };
}

/**
 * `ownVkn` KESİN olarak bilindiğinde (sistemde kayıtlı ve arşivle eşleşen, ya da
 * kullanıcının arşiv VKN listesinden seçtiği) her belge için ayrı ayrı, o belgede
 * `ownVkn` hangi alanda (satıcı/alıcı) geçiyorsa ona göre yön belirler — arşiv hem
 * alış hem satış içerse bile her belge kendi gerçek yönünü doğru yansıtır.
 */
export function resolveLucaDocuments(entries: RawLucaEntry[], ownVkn: string): LucaParsedDocument[] {
  return entries.map(({ baseName, raw, htmlBlob, error }) => {
    if (error || !raw) return errorDoc(baseName, error ?? 'Bilinmeyen hata.');

    let direction: 'alis' | 'satis';
    let vknTckn: string;
    let counterpartyTitle: string;
    if (raw.customerVkn === ownVkn) {
      direction = 'alis'; vknTckn = raw.supplierVkn; counterpartyTitle = raw.supplierTitle;
    } else if (raw.supplierVkn === ownVkn) {
      direction = 'satis'; vknTckn = raw.customerVkn; counterpartyTitle = raw.customerTitle;
    } else {
      return errorDoc(raw.ettn || baseName, 'Bu faturada seçilen VKN/TCKN bulunamadı.');
    }
    if (!vknTckn) return errorDoc(raw.ettn || baseName, 'Karşı taraf VKN/TCKN belgede bulunamadı.');

    return {
      ettn: raw.ettn || baseName,
      documentTypeCode: raw.documentTypeCode,
      htmlBlob: htmlBlob!,
      metadata: {
        documentNo: raw.documentNo,
        documentDate: raw.documentDate,
        direction,
        vknTckn,
        counterpartyTitle,
        totalAmount: raw.totalAmount,
        taxAmount: raw.taxAmount,
        currency: raw.currency,
      },
    };
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
