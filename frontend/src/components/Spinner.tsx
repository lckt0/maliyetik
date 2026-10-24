/** Küçük, tek renkli dönen yükleniyor göstergesi (evrak önizlemesi vb. için). */
export function Spinner({ size = 28, label }: { size?: number; label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" style={{ width: size, height: size }} />
      {label && <p className="muted">{label}</p>}
    </div>
  );
}
