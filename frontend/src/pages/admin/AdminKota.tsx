import { useEffect, useState } from 'react';
import { api, apiError, apiGet } from '../../api/client';
import { GaugeIcon, SearchIcon } from '../../components/Icons';
import { Pagination } from '../../components/Pagination';
import { Paginated, QuotaLedgerEntry, QuotaReason, QuotaTaxpayerSearchResult } from '../../types';
import { formatDateTime } from '../../utils/date';

const REASON_LABELS: Record<QuotaReason, string> = {
  initial: 'Başlangıç',
  purchase: 'Satın Alma',
  admin_grant: 'Admin Tahsisi',
  consume: 'Tüketim',
  refund: 'İade',
  adjustment: 'Düzeltme',
};

export function AdminKota() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<QuotaTaxpayerSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<QuotaTaxpayerSearchResult | null>(null);

  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [ledger, setLedger] = useState<QuotaLedgerEntry[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotalPages, setLedgerTotalPages] = useState(1);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    if (selected) return; // seçim yapıldıysa arama sonuçları listesini gizle
    if (!search.trim()) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      apiGet<QuotaTaxpayerSearchResult[]>('/admin/quota/taxpayers', { search, limit: 10 })
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, selected]);

  function pick(t: QuotaTaxpayerSearchResult) {
    setSelected(t);
    setSearch('');
    setResults([]);
    setMsg(null);
  }

  function clearSelection() {
    setSelected(null);
    setLedger([]);
    setLedgerPage(1);
    setLedgerTotalPages(1);
  }

  async function loadLedger(p: number) {
    if (!selected) return;
    setLedgerLoading(true);
    try {
      const params: Record<string, string | number> = { taxpayerId: selected.taxpayerProfileId, limit: 15, page: p };
      const data = await apiGet<Paginated<QuotaLedgerEntry>>('/admin/quota/ledger', params);
      setLedger(data.items);
      setLedgerTotalPages(data.totalPages ?? 1);
      setLedgerPage(p);
    } catch {
      setLedger([]);
    } finally {
      setLedgerLoading(false);
    }
  }

  async function refreshBalance() {
    if (!selected) return;
    try {
      const balance = await apiGet<{ limit: number; used: number; remaining: number }>(
        `/admin/quota/balance/${selected.taxpayerProfileId}`,
      );
      setSelected({ ...selected, quotaLimit: balance.limit, quotaUsed: balance.used });
    } catch {
      // sessiz geç — kart eski değerle kalır
    }
  }

  useEffect(() => {
    if (selected) loadLedger(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.taxpayerProfileId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setMsg(null); setBusy(true);
    try {
      await api.post('/admin/quota/grant', {
        taxpayerId: selected.taxpayerProfileId, amount: Number(amount), note: note || undefined,
      });
      setMsg({ kind: 'success', text: 'Kota tahsis edildi.' });
      setAmount(''); setNote('');
      await refreshBalance();
      await loadLedger(1);
    } catch (e) { setMsg({ kind: 'error', text: apiError(e) }); }
    finally { setBusy(false); }
  }

  const remaining = selected ? selected.quotaLimit - selected.quotaUsed : 0;
  const pct = selected && selected.quotaLimit > 0 ? Math.min(100, Math.round((selected.quotaUsed / selected.quotaLimit) * 100)) : 0;

  return (
    <>
      <div className="section-head"><h2><GaugeIcon /> Kota Tahsis</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Firma unvanı, VKN veya kullanıcı adı/e-postasına göre bir mükellef arayın; güncel bakiyesini görün,
        yeni kota tahsis edin ve geçmiş tahsis/tüketim hareketlerini inceleyin.
      </p>

      {!selected && (
        <div className="card" style={{ maxWidth: 480, position: 'relative' }}>
          <div className="field">
            <label>Mükellef Ara <SearchIcon /></label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Firma unvanı, VKN veya e-posta…"
              autoFocus
            />
          </div>
          {searching && <p className="muted">Aranıyor…</p>}
          {!searching && results.length > 0 && (
            <ul className="widget-list" style={{ marginTop: '.5rem' }}>
              {results.map((r) => (
                <li key={r.taxpayerProfileId}>
                  <button type="button" className="quota-search-result" onClick={() => pick(r)}>
                    <b>{r.companyTitle}</b>
                    <span className="muted"> — VKN/TCKN: {r.vknTckn}</span>
                    <span className="hint"> ({r.quotaUsed}/{r.quotaLimit} kullanıldı)</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!searching && search.trim() && results.length === 0 && <p className="muted">Sonuç bulunamadı.</p>}
        </div>
      )}

      {selected && (
        <>
          <div className="grid cols-3">
            <div className="card">
              <h3>{selected.companyTitle}</h3>
              <p className="muted" style={{ margin: 0 }}>VKN/TCKN: {selected.vknTckn}</p>
              <button type="button" className="btn secondary sm" style={{ marginTop: '.75rem' }} onClick={clearSelection}>
                ← Farklı mükellef seç
              </button>
            </div>
            <div className="card">
              <h3>Güncel Bakiye</h3>
              <div className="stat">{remaining.toLocaleString('tr-TR')}</div>
              <div className="muted">{selected.quotaUsed} / {selected.quotaLimit} kullanıldı</div>
              <div className="upload-progress-bar" style={{ marginTop: '.5rem' }}>
                <div className="upload-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <form className="card" onSubmit={submit}>
              <h3>Kota Tahsis Et</h3>
              {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
              <div className="field">
                <label>Miktar <span className="req">*</span></label>
                <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
              <div className="field">
                <label>Not</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Manuel tahsis" />
              </div>
              <button className="btn" disabled={busy}>{busy ? 'İşleniyor…' : 'Tahsis Et'}</button>
            </form>
          </div>

          <div className="section-head" style={{ marginTop: '1.5rem' }}><h2>Kota Geçmişi</h2></div>
          <div className="table-wrap fixed-h">
            <table className="compact">
              <thead><tr><th>Tarih</th><th>Sebep</th><th>Değişim</th><th>Bakiye</th><th>Not</th></tr></thead>
              <tbody>
                {ledgerLoading && <tr><td colSpan={5} className="muted">Yükleniyor…</td></tr>}
                {!ledgerLoading && ledger.length === 0 && <tr><td colSpan={5} className="muted">Kayıt yok.</td></tr>}
                {!ledgerLoading && ledger.map((l) => (
                  <tr key={l.id}>
                    <td>{formatDateTime(l.createdAt)}</td>
                    <td>{REASON_LABELS[l.reason]}</td>
                    <td className={l.changeAmount >= 0 ? 'quota-positive' : 'quota-negative'}>
                      {l.changeAmount >= 0 ? '+' : ''}{l.changeAmount}
                    </td>
                    <td>{l.balanceAfter}</td>
                    <td>{l.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={ledgerPage} totalPages={ledgerTotalPages} onChange={loadLedger} disabled={ledgerLoading} />
        </>
      )}
    </>
  );
}
