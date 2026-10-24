import { SITE_HOST, SITE_URL } from '../site';

/**
 * Veri sorumlusunun / satıcının kimlik bilgileri.
 *
 * Yedi yasal metnin tamamı buradan besleniyor: unvan veya adres değiştiğinde tek yer
 * güncellenir. Köşeli parantezli değerler HENÜZ DOLDURULMADI; bu hâldeyken yasal
 * sayfalar üstlerinde "taslak" şeridi gösterir (bkz. LegalPage) — yanlışlıkla
 * `[ŞİRKET UNVANI]` yazan bir sözleşmeyle yayına çıkılmasın diye.
 *
 * DOLDURULMASI GEREKENLER (ticaret sicil kaydından birebir):
 *   unvan, adres, vergiDairesi, vergiNo, mersis, kep, telefon, iletisimEposta
 *
 * Metinler taslaktır ve yayına alınmadan önce AVUKAT ONAYINDAN geçmelidir.
 */
export const FIRMA = {
  unvan: '[ŞİRKET UNVANI]',
  kisaAd: 'Maliyetik',
  adres: '[ADRES]',
  vergiDairesi: '[VERGİ DAİRESİ]',
  vergiNo: '[VERGİ NUMARASI]',
  mersis: '[MERSİS NUMARASI]',
  kep: '[KEP ADRESİ]',
  telefon: '[TELEFON]',
  iletisimEposta: '[İLETİŞİM E-POSTASI]',
  alanAdi: SITE_HOST,
  siteUrl: SITE_URL,
} as const;

/** Sözleşmelerin yürürlük tarihi. Metin değiştikçe elle güncellenir. */
export const YASAL_SURUM = {
  surum: '1.0',
  tarih: '[YÜRÜRLÜK TARİHİ]',
} as const;

/** Doldurulmamış alan kaldı mı? Taslak şeridi buna bakar. */
export function eksikYasalAlanlar(): string[] {
  const eksik: string[] = [];
  for (const [anahtar, deger] of Object.entries({ ...FIRMA, ...YASAL_SURUM })) {
    if (typeof deger === 'string' && deger.startsWith('[')) eksik.push(anahtar);
  }
  return eksik;
}
