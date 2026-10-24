import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { BuildingIcon } from './Icons';
import { CompanyDocumentStatusItem } from '../types';

interface Props {
  taxpayerId: string | null;
  /** '/mukellef/sirket' veya '/musavir/sirket' — panele göre değişir. */
  linkTo: string;
}

/** Anasayfada "N/M zorunlu şirket evrağı tamam" ilerleme göstergesi — Şirket Evraklarım'a link verir. */
export function CompanyDocsStatusWidget({ taxpayerId, linkTo }: Props) {
  const [status, setStatus] = useState<CompanyDocumentStatusItem[] | null>(null);

  useEffect(() => {
    if (!taxpayerId) { setStatus(null); return; }
    apiGet<CompanyDocumentStatusItem[]>('/company-documents/status', { taxpayerId })
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [taxpayerId]);

  if (!taxpayerId || status === null) return null;

  const required = status.filter((s) => s.isRequired);
  const done = required.filter((s) => s.uploadedCount > 0).length;
  const pct = required.length > 0 ? Math.round((done / required.length) * 100) : 100;
  const missing = required.filter((s) => s.uploadedCount === 0);

  return (
    <Link to={linkTo} className="card company-docs-widget">
      <h3><BuildingIcon /> Şirket Evrakları</h3>
      <div className="stat small">{done}/{required.length} zorunlu evrak tamam</div>
      <div className="upload-progress-bar" style={{ margin: '.5rem 0' }}>
        <div className="upload-progress-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--success)' : undefined }} />
      </div>
      {missing.length > 0 ? (
        <p className="muted" style={{ margin: 0 }}>Eksik: {missing.map((m) => m.name).join(', ')}</p>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Tüm zorunlu evraklar yüklü.</p>
      )}
    </Link>
  );
}
