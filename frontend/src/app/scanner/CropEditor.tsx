import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clampQuadToBounds, Point, Quad } from './geometry';

interface Props {
  image: ImageData;
  quad: Quad;
  onChange: (quad: Quad) => void;
}

/** Tutamacın yakalanma yarıçapı (ekran pikseli) — parmak ucu için cömert tutuldu. */
const GRAB_RADIUS = 34;
const MAGNIFIER_SIZE = 108;
const MAGNIFIER_ZOOM = 2.5;

/**
 * Belge köşelerini elle düzeltme. Otomatik tespit çalıştıysa köşeler oradan gelir,
 * çalışmadıysa görüntüyü kaplayan varsayılan dörtgenle başlar — her iki durumda da
 * kullanıcı köşeleri parmağıyla taşıyabilir.
 *
 * Parmak taşınan köşenin üstünü kapattığı için sürükleme sırasında bir büyüteç
 * gösterilir; kullanıcı kağıdın kenarına tam oturttuğunu görebilir.
 */
export function CropEditor({ image, quad, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const magnifierRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [displayWidth, setDisplayWidth] = useState(0);

  // Görüntü tuvale bir kez çizilir; sürükleme sırasında yalnızca SVG katmanı güncellenir.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d')!.putImageData(image, 0, 0);
  }, [image]);

  // CSS ile küçültülmüş tuvalin gerçek genişliği — ekran ↔ görüntü koordinat dönüşümü buna bağlı.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => setDisplayWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [image]);

  const scale = displayWidth > 0 ? displayWidth / image.width : 0;

  const toImageCoords = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
  }, [scale]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!scale) return;
    const p = toImageCoords(e.clientX, e.clientY);
    let nearest = -1;
    let best = Infinity;
    quad.forEach((corner, i) => {
      const d = Math.hypot(corner.x - p.x, corner.y - p.y) * scale;
      if (d < best) { best = d; nearest = i; }
    });
    if (best > GRAB_RADIUS) return;
    // Parmak tuvalden çıksa bile olayları almaya devam et.
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(nearest);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging === null || !scale) return;
    const p = toImageCoords(e.clientX, e.clientY);
    const next = quad.slice() as Quad;
    next[dragging] = p;
    onChange(clampQuadToBounds(next, image.width, image.height));
    e.preventDefault();
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragging === null) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setDragging(null);
  };

  // Büyüteç — sürüklenen köşenin çevresini yakınlaştırarak çizer.
  useEffect(() => {
    if (dragging === null) return;
    const canvas = magnifierRef.current;
    const source = canvasRef.current;
    if (!canvas || !source) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const corner = quad[dragging];
    const half = MAGNIFIER_SIZE / (2 * MAGNIFIER_ZOOM);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE);
    ctx.drawImage(
      source,
      corner.x - half, corner.y - half, half * 2, half * 2,
      0, 0, MAGNIFIER_SIZE, MAGNIFIER_SIZE,
    );
    // Nişangâh
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(MAGNIFIER_SIZE / 2, 0); ctx.lineTo(MAGNIFIER_SIZE / 2, MAGNIFIER_SIZE);
    ctx.moveTo(0, MAGNIFIER_SIZE / 2); ctx.lineTo(MAGNIFIER_SIZE, MAGNIFIER_SIZE / 2);
    ctx.stroke();
  }, [dragging, quad]);

  /** Büyüteci sürüklenen köşenin karşı köşesine yerleştir — parmak onu kapatmasın. */
  const magnifierStyle = useMemo(() => {
    if (dragging === null || !scale) return undefined;
    const corner = quad[dragging];
    const onLeft = corner.x * scale < displayWidth / 2;
    const onTop = corner.y * scale < (image.height * scale) / 2;
    return {
      left: onLeft ? undefined : 12,
      right: onLeft ? 12 : undefined,
      top: onTop ? undefined : 12,
      bottom: onTop ? 12 : undefined,
    } as const;
  }, [dragging, quad, scale, displayWidth, image.height]);

  const polygon = quad.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div ref={wrapRef} className="m-crop"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={endDrag} onPointerCancel={endDrag}>
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto' }} />

      <svg className="m-crop-svg" viewBox={`0 0 ${image.width} ${image.height}`}
        preserveAspectRatio="none" aria-hidden="true">
        <polygon points={polygon} fill="rgba(37, 99, 235, .18)" stroke="#2563eb"
          strokeWidth={Math.max(2, image.width / 300)} vectorEffect="non-scaling-stroke" />
        {quad.map((p, i) => (
          <circle key={i} className="m-crop-handle" cx={p.x} cy={p.y}
            r={Math.max(8, image.width / 60)} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {dragging !== null && (
        <canvas ref={magnifierRef} className="m-magnifier"
          width={MAGNIFIER_SIZE} height={MAGNIFIER_SIZE} style={magnifierStyle} />
      )}
    </div>
  );
}
