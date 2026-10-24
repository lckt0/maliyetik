import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LegalShell } from './LegalShell';
import { YASAL_METINLER } from '../../legal/metinler';

export function LegalIndex() {
  useEffect(() => { document.title = 'Yasal Metinler · Maliyetik'; }, []);

  return (
    <LegalShell>
      <div className="tool-page-inner">
        <h1>Yasal Metinler</h1>
        <p className="muted">
          Hizmeti kullanırken geçerli olan sözleşmeler ve kişisel verilerinize ilişkin bilgilendirmeler.
        </p>
        <div className="legal-index-list">
          {YASAL_METINLER.map((m) => (
            <Link key={m.slug} to={`/yasal/${m.slug}`} className="legal-index-item">
              <span className="legal-index-title">{m.baslik}</span>
              <span className="muted">{m.ozet}</span>
            </Link>
          ))}
        </div>
      </div>
    </LegalShell>
  );
}
