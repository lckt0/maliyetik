import { useCallback, useEffect, useState } from 'react';
import { apiError, apiGet, apiPost } from '../../api/client';
import { WalletIcon } from '../../components/Icons';
import { formatDateTime } from '../../utils/date';

type PaymentRow = {
  id: string;
  uuid: string;
  kind: 'subscription' | 'quota_package' | 'ai_credits';
  amount: string;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  provider: string | null;
  providerRef: string | null;
  description: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  userEmail: string | null;
  userName: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  paid: 'Ödendi',
  failed: 'Başarısız',
  refunded: 'İade Edildi',
  cancelled: 'İptal',
};

const KIND_LABELS: Record<string, string> = {
  subscription: 'Abonelik',
  quota_package: 'Kota Paketi',
  ai_credits: 'AI Kredisi',
};

function tutar(row: PaymentRow): string {
  const n = Number(row.amount);
  const gosterim = Number.isFinite(n) ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) : row.amount;
  return row.currency === 'TRY' ? `₺${gosterim}` : `${gosterim} ${row.currency}`;
}

/**
 * Admin > Ödeme Mutabakatı.
 *
 * Shopier'in api_pay4 akışında sunucu-sunucu webhook YOK: ödemenin bize ulaşmasının
 * tek yolu, kullanıcının tarayıcısıyla dönen callback. Kullanıcı ödeme sonrası sekmeyi
 * kapatır veya bağlantısı koparsa para çekilmiş olmasına rağmen kayıt `pending` kalır
 * ve kimse fark etmez. Bu sayfa, bekleyen kayıtları Shopier panosuyla elle
 * karşılaştırıp eşleştirmek için.
 *
 * "Ödendi işaretle", callback ile AYNI kod yolundan geçer (BillingService.finalizePayment):
 * abonelik aktivasyonu, kota/AI kredisi yükleme ve idempotenslik tek yerde kalır.
 */
export function AdminPayments() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setRows(null);
    try {
      const data = await apiGet<PaymentRow[]>('/admin/billing/payments', status ? { status } : {});
      setRows(data);
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
      setRows([]);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function reconcile(row: PaymentRow) {
    const ref = (refs[row.id] ?? '').trim();
    if (!window.confirm(
      `${row.userEmail ?? 'kullanıcı'} için ${tutar(row)} tutarındaki ödeme "ödendi" işaretlenecek ve `
      + 'plana dahil haklar yüklenecek. Shopier panosunda bu tutarın gerçekten tahsil edildiğini '
      + 'doğruladınız mı?',
    )) return;
    setBusyId(row.id);
    setMsg(null);
    try {
      await apiPost(`/admin/billing/payments/${row.id}/reconcile`, { providerRef: ref || undefined });
      setMsg({ kind: 'success', text: 'Ödeme mutabakat edildi ve haklar yüklendi.' });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
    } finally {
      setBusyId(null);
    }
  }

  async function markFailed(row: PaymentRow) {
    const reason = window.prompt('Başarısız işaretleme nedeni:', 'Shopier panosunda karşılığı bulunamadı');
    if (!reason) return;
    setBusyId(row.id);
    setMsg(null);
    try {
      await apiPost(`/admin/billing/payments/${row.id}/fail`, { reason });
      setMsg({ kind: 'success', text: 'Kayıt başarısız olarak işaretlendi.' });
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="section-head"><h2><WalletIcon /> Ödeme Mutabakatı</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Ödeme sağlayıcısında sunucu-sunucu bildirim yok; ödemenin bize ulaşmasının tek yolu kullanıcının
        dönüş sayfası. Kullanıcı ödemeden sonra sekmeyi kapatırsa kayıt <strong>Bekliyor</strong> durumunda
        kalır. Sağlayıcı panosunu bu listeyle karşılaştırın: karşılığı varsa "Ödendi İşaretle", yoksa
        "Başarısız".
      </p>

      <div className="toolbar">
        <div className="field">
          <label>Durum</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Bekliyor</option>
            <option value="paid">Ödendi</option>
            <option value="failed">Başarısız</option>
            <option value="">Tümü</option>
          </select>
        </div>
      </div>

      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <div className="table-wrap">
        <table className="compact">
          <thead>
            <tr>
              <th>Tarih</th><th>Kullanıcı</th><th>Tür</th><th>Açıklama</th>
              <th>Tutar</th><th>Durum</th><th>Sağlayıcı Ref.</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={8} className="muted">Yükleniyor…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={8} className="muted">Kayıt yok.</td></tr>}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td>{formatDateTime(r.createdAt)}</td>
                <td>
                  {r.userName || '—'}
                  {r.userEmail && <div className="muted" style={{ fontSize: '.78rem' }}>{r.userEmail}</div>}
                </td>
                <td>{KIND_LABELS[r.kind] ?? r.kind}</td>
                <td>
                  {r.description || '—'}
                  {r.failureReason && (
                    <div className="muted" style={{ fontSize: '.78rem' }}>{r.failureReason}</div>
                  )}
                </td>
                <td>{tutar(r)}</td>
                <td>{STATUS_LABELS[r.status] ?? r.status}</td>
                <td>
                  {r.status === 'pending' ? (
                    <input
                      value={refs[r.id] ?? ''}
                      onChange={(e) => setRefs((s) => ({ ...s, [r.id]: e.target.value }))}
                      placeholder="Panodaki işlem no"
                      style={{ minWidth: 150 }}
                    />
                  ) : (r.providerRef || '—')}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.status === 'pending' && (
                    <>
                      <button
                        className="btn sm"
                        disabled={busyId === r.id}
                        onClick={() => void reconcile(r)}
                      >
                        Ödendi İşaretle
                      </button>{' '}
                      <button
                        className="btn sm secondary"
                        disabled={busyId === r.id}
                        onClick={() => void markFailed(r)}
                      >
                        Başarısız
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
