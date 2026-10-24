/**
 * Mükellefe sabit bir renk atar.
 *
 * Müşavir aynı anda birden çok pencerede farklı mükelleflerle çalışabildiği için
 * (bkz. auth.tsx `initialTaxpayerId`), "hangi penceredeyim" sorusunun yazıyı okumadan
 * cevaplanması gerekir. Renk id'den TÜRETİLİR: aynı mükellef her pencerede, her
 * oturumda, her cihazda aynı rengi alır — kaydedilecek bir şey yok.
 *
 * Renkler bilerek koyu ve doygunluğu ölçülü seçildi: hem açık hem koyu temada beyaz
 * yazıyla okunur ve arayüzün ana yeşiliyle yarışmaz.
 */
const PALETTE = [
  '#1D4E89', '#8A3B12', '#5B2E7E', '#0F6B5C', '#8C1D3F',
  '#2C5F2D', '#6B4A1F', '#1F5673', '#7A2E5C', '#3B4C7A',
];

export function taxpayerColor(taxpayerId: string | null | undefined): string | null {
  if (!taxpayerId) return null;
  // Basit, kararlı hash — id'ler sayısal olduğu için de düzgün dağılır.
  let hash = 0;
  for (let i = 0; i < taxpayerId.length; i += 1) {
    hash = (hash * 31 + taxpayerId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
