interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}

/** Sayfa numaralarını daraltır: 1, son ve aktif sayfanın ±1 komşusu — aradakiler "…" ile gösterilir. */
function pageList(page: number, totalPages: number): (number | '…')[] {
  const out: (number | '…')[] = [];
  let last = 0;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - 1 && p <= page + 1)) {
      if (last && p - last > 1) out.push('…');
      out.push(p);
      last = p;
    }
  }
  return out;
}

/** Tüm büyüyebilen tablolarda kullanılan ortak numaralı sayfalama kontrolü. */
export function Pagination({ page, totalPages, onChange, disabled }: Props) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button type="button" className="btn secondary sm" disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}>← Önceki</button>
      {pageList(page, totalPages).map((p, i) => p === '…' ? (
        <span key={`e${i}`} className="pagination-ellipsis">…</span>
      ) : (
        <button key={p} type="button" className={`pagination-page ${p === page ? 'active' : ''}`}
          disabled={disabled} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button type="button" className="btn secondary sm" disabled={disabled || page >= totalPages}
        onClick={() => onChange(page + 1)}>Sonraki →</button>
    </div>
  );
}
