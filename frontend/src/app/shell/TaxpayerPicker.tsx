import { useEffect, useMemo, useState } from 'react';
import { apiError, apiGet } from '../../api/client';
import { useAuth } from '../../auth';
import { useDebouncedValue } from '../../hooks';
import { Authorization, QuotaTaxpayerSearchResult } from '../../types';
import { AlertCircleIcon, BuildingIcon, CheckCircleIcon, SearchIcon, UsersIcon } from '../../components/Icons';
import { setActiveTaxpayerTitle } from '../taxpayerContext';
import { Sheet } from './Sheet';

interface Option { id: string; title: string; vkn: string; }

/**
 * Mükellef seçici — mali müşavir ve admin için.
 *
 * Mükellef rolünde hiç gösterilmez: onların bağlamı kendi profilidir ve
 * `activeTaxpayerId` girişte otomatik dolar.
 *
 * Kaynak role göre değişir:
 *  - Müşavir: `/authorizations/my-taxpayers` — yalnızca AKTİF yetkilendirmeler
 *    (bekleyen/iptal edilmiş yetki ile evrak görüntülenemez).
 *  - Admin: `/admin/quota/taxpayers?search=` — tüm mükelleflerde sunucu taraflı arama;
 *    admin binlerce mükellefe erişebildiği için liste istemciye çekilmez.
 */
export function TaxpayerPicker({ onClose }: { onClose: () => void }) {
  const { user, activeTaxpayerId, setActiveTaxpayerId } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    const load = isAdmin
      ? apiGet<QuotaTaxpayerSearchResult[]>('/admin/quota/taxpayers', { search: q, limit: 25 })
          .then((rows) => rows.map((r) => ({ id: r.taxpayerProfileId, title: r.companyTitle, vkn: r.vknTckn })))
      : apiGet<Authorization[]>('/authorizations/my-taxpayers')
          .then((rows) => rows
            .filter((a) => a.status === 'active' && a.taxpayer)
            .map((a) => ({ id: a.taxpayerId, title: a.taxpayer!.companyTitle, vkn: a.taxpayer!.vknTckn })));

    load.then((rows) => { if (!cancelled) setOptions(rows); })
        .catch((e) => { if (!cancelled) { setError(apiError(e)); setOptions([]); } });
    return () => { cancelled = true; };
    // Admin'de arama sunucuda, müşavirde istemcide → yalnızca admin için yeniden çek.
  }, [isAdmin, isAdmin ? q : '']);

  // Müşavirin listesi tek seferde geldiği için filtre burada uygulanır.
  const visible = useMemo(() => {
    if (!options) return null;
    if (isAdmin || !q) return options;
    const term = q.toLocaleLowerCase('tr-TR');
    return options.filter((o) =>
      o.title.toLocaleLowerCase('tr-TR').includes(term) || o.vkn.includes(term));
  }, [options, q, isAdmin]);

  return (
    <Sheet title="Mükellef seç"
      description={isAdmin
        ? 'Ünvan veya VKN ile arayın — işlemler seçtiğiniz mükellef adına yapılır.'
        : 'İşlemler seçtiğiniz mükellef adına yapılır.'}
      onClose={onClose}>

      <div className="m-field" style={{ position: 'relative' }}>
        <input type="search" inputMode="search" value={search} placeholder="Ünvan veya VKN ara…"
          aria-label="Mükellef ara" style={{ paddingLeft: '2.5rem' }}
          onChange={(e) => setSearch(e.target.value)} />
        <SearchIcon width={18} height={18} aria-hidden="true"
          style={{ position: 'absolute', left: '.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
      </div>

      {error && <div className="m-alert error"><AlertCircleIcon width={18} height={18} /><span>{error}</span></div>}
      {visible === null && !error && <div className="m-loading"><span className="m-spinner" /> Yükleniyor…</div>}

      <div className="m-list">
        {visible?.map((o) => {
          const selected = o.id === activeTaxpayerId;
          return (
            <button key={o.id} type="button" className="m-doc"
              onClick={() => { setActiveTaxpayerId(o.id); setActiveTaxpayerTitle(o.title); onClose(); }}>
              <span className="m-doc-icon" style={selected ? { background: 'var(--success-soft)', color: 'var(--success)' } : undefined}>
                {selected ? <CheckCircleIcon width={20} height={20} /> : <BuildingIcon width={20} height={20} />}
              </span>
              <span className="m-doc-body">
                <span className="m-doc-title">{o.title}</span>
                <span className="m-doc-meta"><span>{o.vkn}</span></span>
              </span>
            </button>
          );
        })}
      </div>

      {visible?.length === 0 && !error && (
        <div className="m-empty">
          <UsersIcon />
          <p>{q
            ? 'Aramanıza uyan mükellef yok.'
            : isAdmin
              ? 'Aramaya başlamak için ünvan veya VKN yazın.'
              : 'Size aktif yetki vermiş bir mükellef bulunmuyor.'}</p>
        </div>
      )}
    </Sheet>
  );
}
