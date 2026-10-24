import { useEffect, useState } from 'react';
import { api, apiError, apiGet } from '../../api/client';
import { useDialog } from '../../components/DialogProvider';
import { AccountantSummary, Authorization } from '../../types';

export function Musavir() {
  const { confirm, alert: alertDialog } = useDialog();
  const [auths, setAuths] = useState<Authorization[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AccountantSummary[]>([]);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() { apiGet<Authorization[]>('/authorizations/mine').then(setAuths).catch(() => {}); }
  useEffect(reload, []);

  const active = auths.find((a) => a.status === 'active');
  const pending = auths.filter((a) => a.status === 'pending');

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setResults(await apiGet<AccountantSummary[]>('/accountants/search', { q }).catch(() => []));
  }

  async function request(accountantId: string) {
    setMsg(null); setBusy(true);
    try {
      await api.post('/authorizations/request', { accountantId });
      setMsg({ kind: 'success', text: 'Yetki talebi gönderildi. Müşavirin onayı bekleniyor.' });
      setResults([]); setQ(''); reload();
    } catch (e) { setMsg({ kind: 'error', text: apiError(e) }); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (!await confirm('Yetkiyi kaldırmak istediğinize emin misiniz?', { danger: true, confirmLabel: 'Kaldır' })) return;
    try { await api.post(`/authorizations/${id}/revoke`); reload(); }
    catch (e) { alertDialog(apiError(e)); }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Mevcut Mali Müşavir</h3>
        {active ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><b>{active.accountant?.displayTitle}</b> <span className="badge active">aktif</span></div>
            <button className="btn danger sm" onClick={() => revoke(active.id)}>Yetkiyi Kaldır</button>
          </div>
        ) : <p className="muted">Henüz mali müşavir atanmadı. Aşağıdan arayıp yetki verebilirsiniz.</p>}
        {pending.length > 0 && (
          <div style={{ marginTop: '.75rem' }}>
            {pending.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '.4rem' }}>
                <span>{p.accountant?.displayTitle} <span className="badge pending">onay bekliyor</span></span>
                <button className="btn secondary sm" onClick={() => revoke(p.id)}>İptal</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!active && (
        <div className="card">
          <h3>Mali Müşavir Ara</h3>
          <form className="toolbar" onSubmit={search}>
            <div className="field" style={{ flex: 1 }}>
              <label>Unvan / Ruhsat No</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SMMM ..." />
            </div>
            <button className="btn">Ara</button>
          </form>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Unvan</th><th>Şehir</th><th>Ruhsat</th><th></th></tr></thead>
              <tbody>
                {results.length === 0 && <tr><td colSpan={4} className="muted">Sonuç yok.</td></tr>}
                {results.map((a) => (
                  <tr key={a.id}>
                    <td>{a.displayTitle}</td><td>{a.city ?? '—'}</td><td>{a.licenseNo ?? '—'}</td>
                    <td><button className="btn sm" disabled={busy} onClick={() => request(a.id)}>Yetki Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
