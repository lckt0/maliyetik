import { Quad, targetSize, unitSquareToQuad } from './geometry';

/** Çıktının uzun kenarı — masaüstündeki `imageCompress.ts` ile aynı sınır. */
export const MAX_OUTPUT_DIMENSION = 1920;

/**
 * Perspektif düzeltme — belgeyi köşelerinden düz bir dikdörtgene açar.
 *
 * Saf TypeScript ile yazıldı, OpenCV GEREKTİRMEZ: kenar tespiti başarısız olsa veya
 * OpenCV hiç yüklenemese bile kullanıcı köşeleri elle koyduğunda düzeltme yine çalışır.
 * Ters haritalama + çift doğrusal (bilinear) örnekleme kullanılır; hedefteki her piksel
 * için kaynaktaki karşılığı hesaplanır, böylece çıktıda delik kalmaz.
 */
export function warpToRect(source: ImageData, quad: Quad, maxDimension = MAX_OUTPUT_DIMENSION): ImageData | null {
  const { width: outW, height: outH } = targetSize(quad, maxDimension);

  // Birim kare → dörtgen dönüşümünün TERSİ alınmaz; bunun yerine hedef pikselin
  // normalize koordinatı (u,v) doğrudan kaynağa taşınır. Böylece tek bir matris yeter.
  const m = unitSquareToQuad(quad);
  if (!m) return null;

  const src = source.data;
  const srcW = source.width;
  const srcH = source.height;
  const out = new ImageData(outW, outH);
  const dst = out.data;

  for (let y = 0; y < outH; y++) {
    const v = (y + 0.5) / outH;
    for (let x = 0; x < outW; x++) {
      const u = (x + 0.5) / outW;

      const w = m[6] * u + m[7] * v + m[8];
      const sx = (m[0] * u + m[1] * v + m[2]) / w;
      const sy = (m[3] * u + m[4] * v + m[5]) / w;

      const di = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx > srcW - 1 || sy > srcH - 1) {
        // Kadraj dışına taşan köşeler beyaz doldurulur — siyah bir kenar, sonraki
        // kontrast normalizasyonunu ve okunabilirliği bozardı.
        dst[di] = 255; dst[di + 1] = 255; dst[di + 2] = 255; dst[di + 3] = 255;
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;

      for (let c = 0; c < 3; c++) {
        dst[di + c] = src[i00 + c] * w00 + src[i10 + c] * w10 + src[i01 + c] * w01 + src[i11 + c] * w11;
      }
      dst[di + 3] = 255;
    }
  }

  return out;
}

/**
 * Kontrast normalizasyonu — kağıdı beyaza, metni koyuya çeker.
 *
 * Kırpma noktaları histogramın %2 ve %98 yüzdeliklerinden alınır (sabit eşik yerine),
 * böylece gölgeli çekimlerde de metin kaybolmaz. Renk kanalları ortak bir eğriden
 * geçer; kanal başına normalizasyon renk sapmasına yol açardı ve fatura kaşeleri/
 * damgaları yanlış renge dönerdi.
 */
export function enhanceContrast(image: ImageData): ImageData {
  const data = image.data;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 parlaklık — insan gözünün kanal duyarlılığına yakın.
    histogram[(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0]++;
  }

  const totalPixels = data.length / 4;
  const low = percentile(histogram, totalPixels, 0.02);
  const high = percentile(histogram, totalPixels, 0.98);
  // Dar aralık = neredeyse düz bir görüntü; germek gürültüyü patlatır, dokunma.
  if (high - low < 24) return image;

  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.max(0, ((i - low) / (high - low)) * 255));
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  return image;
}

function percentile(histogram: Uint32Array, total: number, fraction: number): number {
  const target = total * fraction;
  let seen = 0;
  for (let i = 0; i < 256; i++) {
    seen += histogram[i];
    if (seen >= target) return i;
  }
  return 255;
}

