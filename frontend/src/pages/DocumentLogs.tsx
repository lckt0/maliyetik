import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiError, apiGet } from '../api/client';
import { useAuth } from '../auth';
import { DocumentLogAction, DocumentLogEntry, Paginated } from '../types';
import { Pagination } from '../components/Pagination';
import { PageIntro } from '../components/PageIntro';
import { ClockIcon } from '../components/Icons';
import { formatDateTime } from '../utils/date';

const ACTION_LABELS: Record<DocumentLogAction, string> = {
  uploaded: 'Yüklendi',
  updated: 'Düzenlendi',
  deleted: 'Silindi',
  restored: 'Geri Yüklendi',
  purged: 'Kalıcı Silindi',
  digitized: 'Dijitalleştirildi',
};

const ACTION_BADGE: Record<DocumentLogAction, string> = {
  uploaded: 'active',
  updated: 'pending',
  deleted: 'revoked',
  restored: 'active',
  purged: 'revoked',
  digitized: 'active',
};

export function DocumentLogs() {
  const { user, activeTaxpayerId } = useAuth();
  const [action, setAction] = useState('');
  const [rows, setRows] = useState<DocumentLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const needsTaxpayer = user?.role === 'accountant';
  const blocked = needsTaxpayer && !activeTaxpayerId;

  async function load(p: number) {
    setLoading(true); setError('');
    try {
      const params: Record<string, string | number> = { limit: 25, page: p };
      if (action) params.action = action;
      if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
      const data = await apiGet<Paginated<DocumentLogEntry>>('/documents/logs', params);
      setRows(data.items);
      setTotalPages(data.totalPages ?? 1);
      setPage(p);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (blocked) { setRows([]); return; }
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, activeTaxpayerId, blocked]);

  if (blocked) {
    return (
      <div className="card">
        <p>Devam etmek için önce üst bardan bir mükellef seçin.</p>
        <Link className="btn" to="/musavir/mukellefler">Mükelleflerime Git</Link>
      </div>
    );
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Evraklar üzerinde yapılan tüm ekleme, düzenleme, silme, geri yükleme ve kalıcı silme işlemleri, işlemi yapan kullanıcıyla birlikte burada listelenir.
      </p>

      <PageIntro icon={<ClockIcon />} title="Evrak Geçmişi">
        Evraklarınız üzerinde kim, ne zaman, hangi işlemi yaptı — yükleme, düzenleme, silme,
        geri alma ve dijitalleştirme kayıtları. Bir evrağın neden değiştiğini buradan takip
        edebilirsiniz.
      </PageIntro>

      <div className="toolbar">
        <div className="field">
          <label>İşlem Türü</label>
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Tümü</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-wrap fixed-h">
        <table>
          <thead><tr><th>Tarih</th><th>İşlem</th><th>Evrak</th><th>Kullanıcı</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="muted">Yükleniyor…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="muted">Kayıt yok.</td></tr>}
            {!loading && rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.createdAt)}</td>
                <td><span className={`badge ${ACTION_BADGE[r.action]}`}>{ACTION_LABELS[r.action]}</span></td>
                <td>
                  {r.metadata?.documentTitle ?? '—'}
                  {r.action === 'updated' && r.metadata?.changedFields?.length
                    ? <span className="hint">Değişen: {r.metadata.changedFields.join(', ')}</span>
                    : null}
                </td>
                <td>{r.actorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={load} disabled={loading} />
    </>
  );
}
