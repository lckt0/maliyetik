import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useDataVersion } from '../../dataBus';
import { Paginated, QuotaLedgerEntry, QuotaReason, QuotaSummary } from '../../types';
import { Pagination } from '../../components/Pagination';
import { formatDateTime } from '../../utils/date';

const REASON_LABELS: Record<QuotaReason, string> = {
  initial: 'Başlangıç',
  purchase: 'Satın Alma',
  admin_grant: 'Admin Tahsisi',
  consume: 'Tüketim',
  refund: 'İade',
  adjustment: 'Düzeltme',
};

export function Kota() {
  // Evrak yüklendiğinde/silindiğinde kota göstergesi sayfa yenilenmeden güncellensin.
  const quotaVersion = useDataVersion('quota');
  const [q, setQ] = useState<QuotaSummary | null>(null);
  const [ledger, setLedger] = useState<QuotaLedgerEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => { apiGet<QuotaSummary>('/quota/me').then(setQ).catch(() => {}); }, [quotaVersion]);

  async function loadLedger(p: number) {
    setLoading(true);
    try {
      const data = await apiGet<Paginated<QuotaLedgerEntry>>('/quota/me/ledger', { limit: 15, page: p });
      setLedger(data.items);
      setTotalPages(data.totalPages ?? 1);
      setPage(p);
    } catch {
      setLedger([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLedger(1); }, [quotaVersion]);

  const pct = q && q.limit > 0 ? Math.round((q.used / q.limit) * 100) : 0;

  return (
    <>
      {q?.archived && (
        <div className="alert warning" style={{ maxWidth: 520 }}>
          <strong>Arşiv modundasınız.</strong> Aktif bir aboneliğiniz ya da mali müşavir yetkiniz yok.
          Evraklarınız <strong>silinmedi</strong>: görüntüleyebilir, indirebilir ve dışa aktarabilirsiniz —
          yalnızca yeni evrak yükleme durdu. Bir mali müşavire yetki verdiğinizde ya da abonelik
          başlattığınızda kaldığınız yerden devam edersiniz.
        </div>
      )}
      {!q?.archived && !!q?.overage && (
        <div className="alert warning" style={{ maxWidth: 520 }}>
          Duran evrak sayınız tavanın <strong>{q.overage.toLocaleString('tr-TR')}</strong> üstünde.
          Hiçbir evrak silinmedi; yeni yükleme yapabilmek için evrak kalıcı silin ya da kota ekleyin.
        </div>
      )}
      <div className="card" style={{ maxWidth: 520 }}>
        <h3>Yükleme Kotası</h3>
        <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
          <div><div className="muted">Limit</div><div className="stat small">{q?.limit ?? '—'}</div></div>
          <div><div className="muted">Kullanılan</div><div className="stat small">{q?.used ?? '—'}</div></div>
          <div><div className="muted">Kalan</div><div className="stat small">{q?.remaining ?? '—'}</div></div>
        </div>
        <div style={{ background: '#e2e8f0', borderRadius: 999, height: 12, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, background: pct > 90 ? '#dc2626' : '#2563eb', height: '100%' }} />
        </div>
        {q && (q.fromPlan > 0 || q.fromAccountant > 0 || q.purchased > 0) && (
          <ul className="quota-sources">
            {q.fromAccountant > 0 && (
              <li><span>Mali müşavirinizin paketinden</span><b>{q.fromAccountant.toLocaleString('tr-TR')}</b></li>
            )}
            {q.fromPlan > 0 && (
              <li><span>Kendi aboneliğinizden</span><b>{q.fromPlan.toLocaleString('tr-TR')}</b></li>
            )}
            {q.purchased > 0 && (
              <li><span>Satın aldığınız ek paketler</span><b>{q.purchased.toLocaleString('tr-TR')}</b></li>
            )}
            {q.fromPlan > 0 && q.fromAccountant > 0 && (
              <li className="quota-sources-note">
                Aboneliğiniz ve müşavirinizin koltuğu <strong>toplanmaz</strong> — yüksek olan geçerlidir.
                Bir mükellef için sistemde tek ödeme yapılır.
              </li>
            )}
          </ul>
        )}

        <p className="muted" style={{ marginTop: '.75rem' }}>
          Kullanılan kota, sistemde duran evrak sayınızdır: yüklediğiniz her evrakta 1 azalır
          (şirket evrakları hariç). Çöp kutusundaki evraklar da sayılmaya devam eder; bir evrağı
          <strong> kalıcı olarak sildiğinizde kotanız iade edilir</strong>.
        </p>
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h3>Kota Geçmişi</h3></div>
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
