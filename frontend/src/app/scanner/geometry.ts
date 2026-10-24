export interface Point { x: number; y: number; }

/** Belge köşeleri — HER ZAMAN sol-üst, sağ-üst, sağ-alt, sol-alt sırasında. */
export type Quad = [Point, Point, Point, Point];

/**
 * Rastgele sıradaki dört noktayı sol-üst → sağ-üst → sağ-alt → sol-alt sırasına sokar.
 *
 * `x+y` toplamı sol-üstte en küçük, sağ-altta en büyüktür; `y-x` farkı ise sağ-üstte en
 * küçük, sol-altta en büyüktür. Bu iki ölçüt döndürülmüş dörtgenlerde de doğru çalışır
 * (tam 45°'ye yakın dönmeler dışında — o açıda zaten hangi kenarın "üst" olduğu belirsiz).
 */
export function orderCorners(points: Point[]): Quad {
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...points].sort((a, b) => (a.y - a.x) - (b.y - b.x));
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]];
}

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Dörtgenin düzeltildikten sonraki hedef boyutu — karşılıklı kenarların uzunlarını alır
 * (perspektifte yakın kenar uzun görünür, belgenin gerçek oranına o daha yakındır).
 */
export function targetSize(quad: Quad, maxDimension: number): { width: number; height: number } {
  const [tl, tr, br, bl] = quad;
  const width = Math.max(distance(tl, tr), distance(bl, br));
  const height = Math.max(distance(tl, bl), distance(tr, br));
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Dörtgenin alanı (ayakkabı bağı formülü) — tespit adayları arasında seçim için. */
export function quadArea(quad: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Dörtgen dışbükey mi — kendi üstüne katlanmış tespitleri elemek için. */
export function isConvex(quad: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    const current = Math.sign(cross);
    if (sign === 0) sign = current;
    else if (current !== sign) return false;
  }
  return true;
}

/** Görüntünün tamamını kaplayan (kenarlardan biraz içeride) varsayılan dörtgen. */
export function defaultQuad(width: number, height: number, inset = 0.08): Quad {
  const dx = width * inset;
  const dy = height * inset;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
}

export function clampQuadToBounds(quad: Quad, width: number, height: number): Quad {
  return quad.map((p) => ({
    x: Math.min(width, Math.max(0, p.x)),
    y: Math.min(height, Math.max(0, p.y)),
  })) as Quad;
}

export function scaleQuad(quad: Quad, factor: number): Quad {
  return quad.map((p) => ({ x: p.x * factor, y: p.y * factor })) as Quad;
}

/**
 * Birim kareyi (0,0)-(1,0)-(1,1)-(0,1) verilen dörtgene taşıyan projektif dönüşümün
 * 3x3 matrisi. Klasik kapalı-form çözüm (Heckbert, "Fundamentals of Texture Mapping"):
 * önce afin olmayan bileşenler g,h bulunur, kalan katsayılar bunlardan türetilir.
 *
 * Satır-öncelikli 9 eleman döner. Dörtgen dejenere ise (üç nokta aynı doğru üstünde)
 * null döner — çağıran o kareyi atlamalıdır.
 */
export function unitSquareToQuad(quad: Quad): number[] | null {
  const [p0, p1, p2, p3] = quad;   // (0,0) (1,0) (1,1) (0,1)
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, sx = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, sy = p0.y - p1.y + p2.y - p3.y;

  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-12) return null;

  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;

  return [
    p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
    p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y,
    g, h, 1,
  ];
}

