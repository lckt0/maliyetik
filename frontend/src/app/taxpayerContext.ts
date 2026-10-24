import { appStorage } from '../api/client';

const KEY = 'activeTaxpayerTitle';

/**
 * Seçili mükellefin görünen adı.
 *
 * Sadece id saklamak yetmiyordu: bağlam çubuğu her sayfada adı çözmek için listeyi
 * yeniden çekmek zorunda kalıyordu ve adminde bu hiç güvenilir değildi — admin arama
 * ucundan sayfalanmış sonuç döndüğü için seçili mükellef ilk sayfada olmayabiliyor,
 * ad çözülemiyordu. Seçim anında bilinen adı yanına yazmak hem isteği tümden kaldırıyor
 * hem de her durumda doğru sonucu veriyor.
 *
 * `appStorage` üzerinden yazıldığı için mobil ad alanında (`mobile:`) kalır.
 */
export function setActiveTaxpayerTitle(title: string | null): void {
  if (title) appStorage.set(KEY, title);
  else appStorage.remove(KEY);
}

export function getActiveTaxpayerTitle(): string | null {
  return appStorage.get(KEY);
}
