import { isConvex, orderCorners, Point, Quad, quadArea, scaleQuad } from './geometry';

/**
 * Belge kenarı tespiti — saf TypeScript, harici kütüphane yok.
 *
 * Neden OpenCV.js değil: OpenCV.js'in Embind katmanı başlatma sırasında `new Function()`
 * çağırıyor ve bu, CSP'ye site geneli `'unsafe-eval'` eklenmesini zorunlu kılıyor
 * ('wasm-unsafe-eval' yetmiyor). Mali evrak tutan bir uygulamada XSS savunmasını
 * gevşetmek, bir kolaylık özelliği için makul bir takas değil — üstelik kullanıcı
 * köşeleri her durumda elle düzeltebiliyor. Ek olarak 9.8MB'lık indirme de ortadan kalktı.
 *
 * Boru hattı:
 *   küçült → gri → bulanıklaştır → Sobel gradyanı → yüzdelik eşik → genişlet
 *   → bağlı bileşenler → en büyük aday → dışbükey zarf → köşegen uçları → doğrula
 *
 * Emin olunamayan her durumda `null` döner; çağıran o zaman varsayılan dörtgeni gösterir
 * ve kullanıcı köşeleri kendisi yerleştirir. Yanlış bir dörtgen göstermektense hiç
 * göstermemek daha iyi.
 */

/** Tespit bu çözünürlükte yapılır; köşeler sonra orijinal ölçeğe geri taşınır. */
const DETECT_MAX_DIMENSION = 600;
/** Belge kareyi en az / en çok bu kadar kaplamalı. */
const MIN_AREA_RATIO = 0.15;
const MAX_AREA_RATIO = 0.98;
/** Bulunan dörtgen, zarfın en az bu kadarını kaplamalı — aksi halde şekil dörtgen değildir. */
const MIN_QUAD_TO_HULL = 0.70;
/**
 * En kısa kenar, en uzun kenarın en az bu katı olmalı. Bir üçgenin dörtgen yaklaşımında
 * iki köşe tepede üst üste biner ve o kenar neredeyse sıfır uzunlukta kalır — bu oran
 * onu eler. En uzun fiş şeritlerinde bile oran ~0.2 civarında olduğu için pay bırakıldı.
 */
const MIN_SIDE_RATIO = 0.12;
/** Kenar haritasında bu değerden az pikselli bileşenler (metin, gürültü) atılır. */
const MIN_COMPONENT_PIXELS = 120;
/** Eşikten sonra kare bu orandan fazla "kenar" olduysa sahne gürültülüdür, tespite güvenme. */
const MAX_EDGE_RATIO = 0.35;

export function detectDocument(image: ImageData): Quad | null {
  const scale = Math.min(1, DETECT_MAX_DIMENSION / Math.max(image.width, image.height));
  const { gray, width, height } = toGrayscale(image, scale);
  if (width < 40 || height < 40) return null;

  const blurred = boxBlur3(gray, width, height);
  const magnitude = sobelMagnitude(blurred, width, height);
  const edges = thresholdOtsu(magnitude);
  if (!edges) return null;
  dilate3(edges, width, height);

  const frameArea = width * height;
  const component = largestComponent(edges, width, height, frameArea);
  if (!component) return null;

  const hull = convexHull(component);
  if (hull.length < 4) return null;

  const quad = orderCorners(diagonalExtremes(hull));
  // Aynı noktanın iki kez seçilmesi (çok ince/dejenere şekil) → güvenilmez.
  if (new Set(quad.map((p) => `${p.x},${p.y}`)).size !== 4) return null;
  if (!isConvex(quad)) return null;
  // Üçgen/yamuk gibi şekillerde iki köşe neredeyse üst üste biner; en kısa kenarın
  // en uzun kenara oranı bunu yakalar (dörtgen alan/zarf oranı yakalayamıyor).
  if (shortestSideRatio(quad) < MIN_SIDE_RATIO) return null;

  const area = quadArea(quad);
  if (area < frameArea * MIN_AREA_RATIO || area > frameArea * MAX_AREA_RATIO) return null;
  // Şekil gerçekten dörtgen mi: zarfın büyük kısmını kaplamıyorsa (ör. L şeklinde bir
  // gölge veya birbirine yapışmış iki nesne) tespite güvenme.
  if (area < polygonArea(hull) * MIN_QUAD_TO_HULL) return null;

  return scale < 1 ? scaleQuad(quad, 1 / scale) : quad;
}

/* ------------------------------------------------------------- ön işleme -- */

function toGrayscale(image: ImageData, scale: number): { gray: Uint8Array; width: number; height: number } {
  if (scale >= 1) {
    const gray = new Uint8Array(image.width * image.height);
    for (let i = 0, p = 0; i < image.data.length; i += 4, p++) {
      gray[p] = (image.data[i] * 299 + image.data[i + 1] * 587 + image.data[i + 2] * 114) / 1000;
    }
    return { gray, width: image.width, height: image.height };
  }

  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const source = document.createElement('canvas');
  source.width = image.width;
  source.height = image.height;
  source.getContext('2d')!.putImageData(image, 0, 0);

  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, 0, 0, width, height);

  const small = ctx.getImageData(0, 0, width, height);
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < small.data.length; i += 4, p++) {
    gray[p] = (small.data[i] * 299 + small.data[i + 1] * 587 + small.data[i + 2] * 114) / 1000;
  }
  return { gray, width, height };
}

/** 3x3 kutu bulanıklaştırma — kağıt dokusu ve JPEG gürültüsünü bastırır. */
function boxBlur3(src: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += src[yy * width + xx];
          count++;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

/** Sobel gradyan büyüklüğü. Kenar pikselleri (2px çerçeve) sıfırlanır — kadrajın
 *  kendi sınırı her zaman güçlü bir "kenar" üretip belge sanılırdı. */
function sobelMagnitude(src: Uint8Array, width: number, height: number): Uint16Array {
  const out = new Uint16Array(src.length);
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      const tl = src[i - width - 1], t = src[i - width], tr = src[i - width + 1];
      const l = src[i - 1], r = src[i + 1];
      const bl = src[i + width - 1], b = src[i + width], br = src[i + width + 1];
      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      out[i] = Math.min(65535, Math.abs(gx) + Math.abs(gy));
    }
  }
  return out;
}

/**
 * Otsu eşiği — gradyan histogramını "düz alan" ve "kenar" olmak üzere iki sınıfa ayıran,
 * sınıflar arası varyansı en büyük yapan değeri seçer.
 *
 * Sabit yüzdelik (ör. "en güçlü %10") denendi ve kırılgan çıktı: temiz/kontrastlı bir
 * sahnede gradyanı sıfırdan farklı piksellerin neredeyse tamamı zaten belgenin kenarıdır,
 * bunların %10'unu almak dış hattı parçalara bölüp bağlı bileşeni yok ediyordu. Otsu,
 * kenar piksellerinin oranı ne olursa olsun doğru ayrımı bulur.
 *
 * Eşik sonrası kare çok fazla "kenar" içeriyorsa sahne (gürültü, desenli masa örtüsü)
 * güvenilir değildir — null dönülüp elle kırpmaya düşülür.
 */
function thresholdOtsu(magnitude: Uint16Array): Uint8Array | null {
  const BUCKETS = 512;
  const SHIFT = 7;                       // 65535 >> 7 ≈ 511
  const histogram = new Uint32Array(BUCKETS);
  for (let i = 0; i < magnitude.length; i++) histogram[Math.min(BUCKETS - 1, magnitude[i] >> SHIFT)]++;

  const total = magnitude.length;
  let sumAll = 0;
  for (let b = 0; b < BUCKETS; b++) sumAll += b * histogram[b];

  let weightBg = 0;
  let sumBg = 0;
  let bestVariance = -1;
  let bestBucket = 0;
  for (let b = 0; b < BUCKETS; b++) {
    weightBg += histogram[b];
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += b * histogram[b];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const variance = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (variance > bestVariance) { bestVariance = variance; bestBucket = b; }
  }

  // Tamamen düz bir görüntüde (tüm gradyanlar 0) ayrım yoktur.
  if (bestVariance <= 0) return null;

  const cut = (bestBucket + 1) << SHIFT;
  const edges = new Uint8Array(total);
  let count = 0;
  for (let i = 0; i < total; i++) {
    if (magnitude[i] >= cut) { edges[i] = 1; count++; }
  }
  if (count === 0 || count > total * MAX_EDGE_RATIO) return null;
  return edges;
}

/** 3x3 genişletme — gölgede kesintiye uğramış kağıt kenarını sürekli hale getirir. */
function dilate3(mask: Uint8Array, width: number, height: number): void {
  const source = mask.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (source[i]) continue;
      for (let dy = -1; dy <= 1 && !mask[i]; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (source[yy * width + xx]) { mask[i] = 1; break; }
        }
      }
    }
  }
}

/* ------------------------------------------------------- bağlı bileşenler -- */

/**
 * Kenar maskesindeki en büyük bağlı bileşenin piksellerini döner (8-komşuluk).
 * Belgenin dış hattı, metin lekelerinden çok daha uzun ve geniş bir bileşen oluşturur.
 * Yığın tabanlı taşma dolgusu kullanılır — özyineleme büyük görüntülerde çağrı yığınını taşırırdı.
 */
function largestComponent(mask: Uint8Array, width: number, height: number, frameArea: number): Point[] | null {
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let best: Point[] | null = null;
  let bestScore = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue;

    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    const pixels: Point[] = [];
    let minX = width, maxX = 0, minY = height, maxY = 0;

    while (top > 0) {
      const i = stack[--top];
      const x = i % width;
      const y = (i / width) | 0;
      pixels.push({ x, y });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (mask[j] && !visited[j]) { visited[j] = 1; stack[top++] = j; }
        }
      }
    }

    if (pixels.length < MIN_COMPONENT_PIXELS) continue;
    const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
    if (boxArea < frameArea * MIN_AREA_RATIO || boxArea > frameArea * MAX_AREA_RATIO) continue;
    if (boxArea > bestScore) { bestScore = boxArea; best = pixels; }
  }

  return best;
}

/* --------------------------------------------------------- dışbükey zarf -- */

/** Andrew'ın monoton zincir algoritması — O(n log n), saat yönünün tersine zarf. */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const build = (pts: Point[]) => {
    const chain: Point[] = [];
    for (const p of pts) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop();
      chain.push(p);
    }
    chain.pop();
    return chain;
  };

  return [...build(sorted), ...build(sorted.reverse())];
}

/**
 * Dörtgenin köşeleri: `x+y` en küçük olan sol-üst, en büyük olan sağ-alt; `x-y` en büyük
 * olan sağ-üst, en küçük olan sol-alt köşedir. Döndürülmüş ve perspektifle bozulmuş
 * dikdörtgenlerde de doğru sonuç verir.
 */
function diagonalExtremes(hull: Point[]): Point[] {
  let tl = hull[0], br = hull[0], tr = hull[0], bl = hull[0];
  for (const p of hull) {
    if (p.x + p.y < tl.x + tl.y) tl = p;
    if (p.x + p.y > br.x + br.y) br = p;
    if (p.x - p.y > tr.x - tr.y) tr = p;
    if (p.x - p.y < bl.x - bl.y) bl = p;
  }
  return [tl, tr, br, bl];
}

/** En kısa kenarın en uzun kenara oranı. */
function shortestSideRatio(quad: Quad): number {
  let min = Infinity;
  let max = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < min) min = len;
    if (len > max) max = len;
  }
  return max === 0 ? 0 : min / max;
}

function polygonArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}
