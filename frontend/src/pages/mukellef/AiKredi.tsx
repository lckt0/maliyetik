import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { AiCreditLedgerEntry, AiCreditReason, AiCreditSummary, Paginated } from '../../types';
import { Pagination } from '../../components/Pagination';
import { formatDateTime } from '../../utils/date';

const REASON_LABELS: Record<AiCreditReason, string> = {
  initial: 'Başlangıç',
  admin_grant: 'Admin Tahsisi',
  consume: 'Tüketim',
  refund: 'İade',
  adjustment: 'Düzeltme',
};

/** Mükellef/müşavir kendi AI kredi bakiyesi + geçmişi — "Kota" sayfasının AI kredi karşılığı. */
export function AiKredi() {
  const [c, setC] = useState<AiCreditSummary | null>(null);
  const [ledger, setLedger] = useState<AiCreditLedgerEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => { apiGet<AiCreditSummary>('/ai-credits/me').then(setC).catch(() => {}); }, []);

  async function loadLedger(p: number) {
    setLoading(true);
    try {
      const data = await apiGet<Paginated<AiCreditLedgerEntry>>('/ai-credits/me/ledger', { limit: 15, page: p });
      setLedger(data.items);
      setTotalPages(data.totalPages ?? 1);
      setPage(p);
    } catch {
      setLedger([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLedger(1); }, []);

  const pct = c && c.limit > 0 ? Math.round((c.used / c.limit) * 100) : 0;

  return (
    <>
      <div className="card" style={{ maxWidth: 520 }}>
        <h3>AI Kredisi</h3>
        <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
          <div><div className="muted">Limit</div><div className="stat small">{c?.limit ?? '—'}</div></div>
          <div><div className="muted">Kullanılan</div><div className="stat small">{c?.used ?? '—'}</div></div>
          <div><div className="muted">Kalan</div><div className="stat small">{c?.remaining ?? '—'}</div></div>
        </div>
        <div style={{ background: '#e2e8f0', borderRadius: 999, height: 12, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, background: pct > 90 ? '#dc2626' : '#2563eb', height: '100%' }} />
        </div>
        <p className="muted" style={{ marginTop: '.75rem' }}>
          AI kredisi, Evrak Dijitalleştir sayfasında yapay zeka ile doldurma/otomatik mod kullandıkça azalır.
        </p>
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h3>AI Kredi Geçmişi</h3></div>
      <div className="table-wrap fixed-h">
        <table className="compact">
          <thead><tr><th>Tarih</th><th>Sebep</th><th>Değişim</th><th>Bakiye</th><th>Not</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="muted">Yükleniyor…</td></tr>}
            {!loading && ledger.length === 0 && <tr><td colSpan={5} className="muted">Kayıt yok.</td></tr>}
            {!loading && ledger.map((l) => (
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
      <Pagination page={page} totalPages={totalPages} onChange={loadLedger} disabled={loading} />
    </>
  );
}
