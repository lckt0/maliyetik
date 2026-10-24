import { ReactNode, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { openTaxpayerTab, taxpayerTabPath } from '../tabs';
import { useMyTaxpayers } from '../taxpayers';
import { taxpayerColor } from '../utils/taxpayerColor';
import { ExternalWindowIcon, SearchIcon, UsersIcon } from './Icons';

/**
 * Mükellef bağlamı gerektiren sayfaların kapısı.
 *
 * Müşavirin OFİS sekmesinde mükellef bazlı işlem yapılmaz: ofis sekmesi "kimde ne eksik" panosudur, bir mükellefle çalışmak için
 * o mükellef kendi sekmesinde açılır. Böylece hangi sekmede kimin verisine baktığınız
 * her zaman belli olur — yanlış mükellefe evrak yüklemenin önündeki asıl risk buydu;
 * ayrıca Luca alışkanlığındaki çoklu pencere düzeni sekmelerle doğal hâle gelir.
 *
 * Mükellef rolündeki kullanıcılar için bu bileşen şeffaftır: onların bağlamı kendi
 * profilleridir, hiçbir zaman boş kalmaz.
 */
export function TaxpayerScoped({ children }: { children: ReactNode }) {
  const { user, activeTaxpayerId } = useAuth();
  const { active } = useMyTaxpayers();
  const location = useLocation();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr-TR');
    if (!term) return active;
    return active.filter((a) =>
      a.taxpayer?.companyTitle?.toLocaleLowerCase('tr-TR').includes(term)
      || a.taxpayer?.vknTckn?.toLocaleLowerCase('tr-TR').includes(term));
  }, [active, q]);

  if (activeTaxpayerId || user?.role !== 'accountant') return <>{children}</>;

  return (
    <div className="card scoped-gate">
      <h3 style={{ marginTop: 0 }}>Bu sayfa bir mükellef sekmesinde açılır</h3>
      <p className="muted">
        Ofis sekmenizde mükellef bazlı işlem yapılmaz. Aşağıdan bir mükellef seçin —
        kendi sekmesinde açılır ve o sekme baştan sona o mükellefe bağlı kalır.
        Aynı anda birden fazla mükellefle çalışabilirsiniz.
      </p>

      {active.length === 0 ? (
        <p>
          Henüz aktif mükellefiniz yok.{' '}
          <Link to="/musavir/mukellefler">Mükellef ekleyin</Link>.
        </p>
      ) : (
        <>
          <div className="field" style={{ maxWidth: 360 }}>
            <label htmlFor="scoped-search"><SearchIcon /> Mükellef Ara</label>
            <input id="scoped-search" placeholder="Ünvan veya VKN/TCKN…" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="scoped-gate-list thin-scroll">
            {filtered.length === 0 && <p className="muted">Sonuç yok.</p>}
            {filtered.map((a) => (
              <button type="button" key={a.id} className="scoped-gate-item"
                onClick={() => openTaxpayerTab(a.taxpayerId, taxpayerTabPath(location.pathname), {
                  taxpayerTitle: a.taxpayer?.companyTitle ?? null,
                })}>
                <span className="tp-dot" style={{ background: taxpayerColor(a.taxpayerId) ?? undefined }} aria-hidden="true" />
                <span className="tp-name">{a.taxpayer?.companyTitle}</span>
                <span className="muted">{a.taxpayer?.vknTckn}</span>
                <ExternalWindowIcon />
              </button>
            ))}
          </div>
        </>
      )}

      <p className="hint">
        <UsersIcon /> Kimde eksik evrak var, kimin kuyruğu birikmiş —{' '}
        <Link to="/musavir">Mükellef Panosu</Link>.
      </p>
    </div>
  );
}
