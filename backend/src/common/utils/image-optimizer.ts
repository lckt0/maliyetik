import sharp from 'sharp';

/**
 * PNG dosyalarını KAYIPSIZ olarak yeniden sıkıştırır — yalnızca deflate/filtre seçimini
 * iyileştirerek boyutu küçültür, piksel verisini asla değiştirmez (palet/renk niceleme YOK).
 * Sonuç orijinalden büyük/eşitse orijinal buffer korunur. Bozuk/desteklenmeyen bir görselde
 * sessizce orijinali döner — yükleme kalite/boyut optimizasyonu yüzünden başarısız olmamalı.
 */
export async function optimizeIfPng(buffer: Buffer, mimeType: string): Promise<Buffer> {
  if (mimeType !== 'image/png') return buffer;
  try {
    const optimized = await sharp(buffer, { limitInputPixels: false })
      .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
      .toBuffer();
    return optimized.length < buffer.length ? optimized : buffer;
  } catch {
    return buffer;
  }
}
