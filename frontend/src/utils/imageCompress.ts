/**
 * Evrak fotoğrafları telefon kameralarından genellikle çok büyük (birkaç MB, 4000px+)
 * geliyor — bu da yüklemeyi yavaşlatıyor. Yüklemeden önce tarayıcıda (canvas ile)
 * makul bir çözünürlüğe küçültüp JPEG'e yeniden kodluyoruz. Zaten küçükse veya
 * herhangi bir adımda hata olursa orijinal dosya olduğu gibi kullanılır.
 */
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.82;
/** Bundan küçük ve zaten yeterince düşük çözünürlükteki dosyalar sıkıştırılmadan geçer. */
const SKIP_BELOW_BYTES = 800 * 1024;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size <= SKIP_BELOW_BYTES) {
      bitmap.close();
      return file;
    }

    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^./\\]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
