/**
 * Toplu Z-Raporu yüklemesinde tüm dosyaların paylaşacağı Fiş Grubu No — ay+yıl (örn. 062026).
 *
 * Masaüstündeki "Evrak Kayıt" (QuickUpload) ve mobil belge tarayıcı aynı kaynağı kullanır;
 * böylece iki taraftan yüklenen fişler ay bazında aynı gruba düşer ve dijitalleştirme
 * sırasında grup no elle girilmek zorunda kalmaz.
 */
export function generateReceiptGroupNo(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${month}${date.getFullYear()}`;
}
