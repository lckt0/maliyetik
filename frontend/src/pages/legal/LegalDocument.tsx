import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LegalShell } from './LegalShell';
import { yasalMetinBul } from '../../legal/metinler';
import { YASAL_SURUM } from '../../legal/firma';
import type { YasalBolum } from '../../legal/tipler';

function Bolum({ bolum }: { bolum: YasalBolum }) {
  return (
    <section className="legal-section">
      <h2>{bolum.baslik}</h2>
      {bolum.paragraflar?.map((p, i) => <p key={i}>{p}</p>)}
      {bolum.tablo && (
        <div className="legal-table-wrap">
          <table className="legal-table">
            <thead>
              <tr>{bolum.tablo.basliklar.map((b, i) => <th key={i}>{b}</th>)}</tr>
            </thead>
            <tbody>
              {bolum.tablo.satirlar.map((satir, i) => (
                <tr key={i}>{satir.map((h, j) => <td key={j}>{h}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bolum.maddeler && (
        <ul className="legal-list">
          {bolum.maddeler.map((m, i) => <li key={i}>{m}</li>)}
        </ul>
      )}
    </section>
  );
}

export function LegalDocument() {
  const { slug } = useParams<{ slug: string }>();
  const metin = yasalMetinBul(slug);

  useEffect(() => {
    document.title = metin ? `${metin.baslik} · Maliyetik` : 'Yasal Metinler · Maliyetik';
  }, [metin]);

  if (!metin) {
    return (
      <LegalShell>
        <div className="tool-page-inner">
          <h1>Metin bulunamadı</h1>
          <p className="muted">Aradığınız yasal metin kaldırılmış veya adresi değişmiş olabilir.</p>
          <Link to="/yasal" className="btn">Tüm Yasal Metinler</Link>
        </div>
      </LegalShell>
    );
  }

  return (
    <LegalShell>
      <div className="tool-page-inner">
        <Link to="/yasal" className="tool-page-breadcrumb">← Tüm Yasal Metinler</Link>
        <h1>{metin.baslik}</h1>
        <p className="muted legal-meta">
          Sürüm {YASAL_SURUM.surum} · Yürürlük tarihi: {YASAL_SURUM.tarih}
        </p>
        {metin.bolumler.map((b, i) => <Bolum key={i} bolum={b} />)}
      </div>
    </LegalShell>
  );
}
