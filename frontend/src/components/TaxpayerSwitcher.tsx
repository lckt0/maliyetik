import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { openOfficeTab, openTaxpayerTab, taxpayerTabPath, TAXPAYER_TAB_HOME } from '../tabs';
import { useMyTaxpayers } from '../taxpayers';
import { taxpayerColor } from '../utils/taxpayerColor';
import { ExternalWindowIcon, HomeIcon, SearchIcon } from './Icons';

/**
 * Üst bar mükellef seçici (müşavir için) — arama özellikli dropdown.
 *
 * İki farklı davranışı vardır:
 *  - OFİS sekmesinde (mükellef yok) seçim yerinde DEĞİŞTİRMEZ, mükellefi kendi
 *    sekmesinde açar. Ofis sekmesi mükellef bazlı işlem yapmaz (bkz. components/TaxpayerScoped.tsx).
 *  - MÜKELLEF sekmesinde seçim yalnızca BU SEKMENİN bağlamını değiştirir; diğer
 *    sekmeler etkilenmez (bkz. tabs.tsx setTabTaxpayer).
 *
 * Renk noktası, hangi mükellefin sekmesinde olduğunuzu yazı okumadan ayırt etmek
 * içindir — sekme şeridindeki nokta ve sayfanın üstündeki şeritle aynı renk.
 */
export function TaxpayerSwitcher() {
  const { activeTaxpayerId, setActiveTaxpayerId } = useAuth();
  const { active, current } = useMyTaxpayers();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('tr-TR');
    if (!term) return active;
    return active.filter((a) =>
      a.taxpayer?.companyTitle?.toLocaleLowerCase('tr-TR').includes(term)
      || a.taxpayer?.vknTckn?.toLocaleLowerCase('tr-TR').includes(term));
  }, [active, q]);

  const activeColor = taxpayerColor(activeTaxpayerId);
  /** Mükellefi olmayan müşavir sekmesi = ofis sekmesi. */
  const officeTab = !activeTaxpayerId;

  /**
   * Mükellefi kendi sekmesinde açar. Açık sekmesi varsa yenisini açmaz, ona geçer
   * (bkz. tabs.tsx openTaxpayerTab). Bulunulan sayfa mükellef bazlı değilse Evraklar'a
   * düşer — ofis sayfasını mükellefle açmak kullanıcıyı yine ofise götürürdü.
   */
  function openInTab(taxpayerId: string, companyTitle?: string, force = false) {
    openTaxpayerTab(taxpayerId, officeTab ? TAXPAYER_TAB_HOME : taxpayerTabPath(location.pathname), {
      taxpayerTitle: companyTitle ?? null,
      force,
    });
    setOpen(false);
    setQ('');
  }

  return (
    <div className="taxpayer-switcher" ref={ref}>
      <button type="button" className="taxpayer-switcher-trigger" onClick={() => setOpen((o) => !o)}>
        {activeColor && <span className="tp-dot" style={{ background: activeColor }} aria-hidden="true" />}
        <span className="taxpayer-switcher-label">{officeTab ? 'Mükellef Aç' : 'Mükellef'}</span>
        <span>
          {current
            ? current.taxpayer?.companyTitle
            : <span className="muted">{officeTab ? 'Sekmede aç…' : 'Seçin…'}</span>}
        </span>
      </button>
      {activeTaxpayerId && (
        <button type="button" className="icon-btn sm tp-new-window" title="Bu mükellefi ikinci bir sekmede aç"
          onClick={() => openInTab(activeTaxpayerId, current?.taxpayer?.companyTitle, true)}>
          <ExternalWindowIcon />
        </button>
      )}
      {!officeTab && (
        <button type="button" className="tp-back-office" onClick={() => { setOpen(false); openOfficeTab(); }}
          title="Ofis sekmesine geçer — bu mükellefin sekmesi açık kalır">
          <HomeIcon /> <span>Mali Müşavir Paneli</span>
        </button>
      )}
      {open && (
        <div className="taxpayer-switcher-panel">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="tp-search"><SearchIcon /> Mükellef Ara</label>
            <input id="tp-search" autoFocus placeholder="Ünvan veya VKN/TCKN…" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="taxpayer-switcher-list">
            {filtered.length === 0 && <div className="muted" style={{ padding: '.6rem' }}>Sonuç yok.</div>}
            {filtered.map((a) => (
              <div key={a.id} className={`taxpayer-switcher-row ${a.taxpayerId === activeTaxpayerId ? 'active' : ''}`}>
                <button type="button" className="taxpayer-switcher-item"
                  title={officeTab ? 'Kendi sekmesinde aç' : 'Bu sekmede aç'}
                  onClick={() => {
                    if (officeTab) { openInTab(a.taxpayerId, a.taxpayer?.companyTitle); return; }
                    setActiveTaxpayerId(a.taxpayerId); setOpen(false); setQ('');
                  }}>
                  <span className="tp-dot" style={{ background: taxpayerColor(a.taxpayerId) ?? undefined }} aria-hidden="true" />
                  <span className="tp-name">{a.taxpayer?.companyTitle}</span>
                  <span className="muted">{a.taxpayer?.vknTckn}</span>
                </button>
                <button type="button" className="icon-btn sm" title="Kendi sekmesinde aç"
                  onClick={() => openInTab(a.taxpayerId, a.taxpayer?.companyTitle)}>
                  <ExternalWindowIcon />
                </button>
              </div>
            ))}
          </div>
          <p className="hint" style={{ padding: '.5rem .6rem 0', margin: 0 }}>
            {officeTab
              ? 'Mükellef bazlı işlemler kendi sekmesinde yapılır. Seçtiğiniz mükellef yeni bir sekmede açılır; aynı anda birden fazla mükellefle çalışabilirsiniz.'
              : 'Her sekme kendi mükellefini hatırlar — bu sekmedeki değişiklik diğer sekmeleri etkilemez.'}
          </p>
        </div>
      )}
    </div>
  );
}
