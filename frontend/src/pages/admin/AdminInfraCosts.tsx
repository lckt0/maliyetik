import { useEffect, useState } from 'react';
import { apiDelete, apiError, apiGet } from '../../api/client';
import { InfraCostFormModal } from '../../components/InfraCostFormModal';
import { PencilIcon, PlusIcon, TrashIcon, WalletIcon } from '../../components/Icons';
import { useDialog } from '../../components/DialogProvider';
import { formatBytes } from '../../utils/formatBytes';
import { InfraCostBillingCycle, InfraCostCategory, InfraCostRow, InfraCostSummary, InfraLiveData } from '../../types';

const CATEGORY_LABELS: Record<InfraCostCategory, string> = {
  server: 'Sunucu', hosting: 'Hosting', database: 'Veritabanı', storage: 'Depolama',
  domain: 'Domain', email: 'E-posta', other: 'Diğer',
};

const CYCLE_LABELS: Record<InfraCostBillingCycle, string> = {
  monthly: 'Aylık', yearly: 'Yıllık', one_time: 'Tek Seferlik',
};

function fmtMoney(amount: number, currency = 'TRY'): string {
  return `${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function AdminInfraCosts() {
  const { confirm } = useDialog();
  const [items, setItems] = useState<InfraCostRow[]>([]);
  const [summary, setSummary] = useState<InfraCostSummary | null>(null);
  const [live, setLive] = useState<InfraLiveData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<InfraCostRow | null>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const data = await apiGet<{ items: InfraCostRow[]; summary: InfraCostSummary }>('/admin/infra-costs');
      setItems(data.items);
      setSummary(data.summary);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    apiGet<InfraLiveData>('/admin/infra-costs/live').then(setLive).catch(() => setLive(null));
  }, []);

  async function remove(item: InfraCostRow) {
    if (!await confirm(`"${item.name}" kaydı silinsin mi?`, { danger: true, confirmLabel: 'Sil' })) return;
    try {
      await apiDelete(`/admin/infra-costs/${item.id}`);
      load();
    } catch (e) { setError(apiError(e)); }
  }

  return (
    <>
      <div className="section-head">
        <h2><WalletIcon /> Altyapı Maliyetleri</h2>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Sunucu, hosting, veritabanı, depolama, domain ve e-posta gibi servislerin maliyet/ödeme kayıtlarını buradan
        takip edin. Aşağıdaki "Canlı Kullanım" kartları, yapılandırılmışsa Google Cloud ve Brevo'dan gerçek zamanlı veri gösterir.
      </p>

      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-4">
        <div className="card">
          <h3>Toplam Aylık Eşdeğer</h3>
          <div className="stat">{summary ? fmtMoney(summary.totalMonthlyEquivalent) : '—'}</div>
        </div>
        {summary?.byCategory.map((c) => (
          <div className="card" key={c.category}>
            <h3>{CATEGORY_LABELS[c.category]}</h3>
            <div className="stat small">{fmtMoney(c.monthlyEquivalent)}</div>
          </div>
        ))}
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h2>Canlı Kullanım</h2></div>
      <div className="grid cols-3">
        <div className="card">
          <h3>GCS Depolama</h3>
          <div className="stat small">{live ? formatBytes(live.gcs.storageBytes) : '—'}</div>
          <p className="muted" style={{ margin: 0 }}>Toplam evrak boyutu (gerçek kullanım).</p>
        </div>
        <div className="card">
          <h3>Google Cloud Billing</h3>
          {live?.gcpBilling.configured ? (
            <>
              <div className="stat small">{fmtMoney(live.gcpBilling.last30DaysTotal ?? 0, live.gcpBilling.currency)}</div>
              <p className="muted" style={{ margin: 0 }}>Son 30 gün toplam harcama.</p>
            </>
          ) : (
            <p className="muted">Yapılandırılmadı. GCP_BILLING_* ortam değişkenlerini ekleyin.</p>
          )}
        </div>
        <div className="card">
          <h3>Brevo</h3>
          {live?.brevo.configured ? (
            <>
              <div className="stat small">{live.brevo.planType ?? '—'}</div>
              <p className="muted" style={{ margin: 0 }}>{live.brevo.credits != null ? `${live.brevo.credits} kredi kaldı` : ''}</p>
            </>
          ) : (
            <p className="muted">Yapılandırılmadı. BREVO_API_KEY ortam değişkenini ekleyin.</p>
          )}
        </div>
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}>
        <h2>Maliyet Kayıtları</h2>
        <button type="button" className="btn sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <PlusIcon /> Yeni Kayıt
        </button>
      </div>

      <div className="table-wrap">
        <table className="compact">
          <thead>
            <tr><th>Ad</th><th>Kategori</th><th>Sağlayıcı</th><th>Tutar</th><th>Periyot</th><th>Sonraki Ödeme</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="muted">Yükleniyor…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7} className="muted">Kayıt yok.</td></tr>}
            {!loading && items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{CATEGORY_LABELS[item.category]}</td>
                <td>{item.provider ?? '—'}</td>
                <td>{fmtMoney(Number(item.amount), item.currency)}</td>
                <td>{CYCLE_LABELS[item.billingCycle]}</td>
                <td>{item.nextBillingDate ?? '—'}</td>
                <td className="row-actions">
                  <button type="button" className="icon-btn sm" title="Düzenle" onClick={() => { setEditing(item); setFormOpen(true); }}><PencilIcon /></button>
                  <button type="button" className="icon-btn sm danger" title="Sil" onClick={() => remove(item)}><TrashIcon /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <InfraCostFormModal
          existing={editing ?? undefined}
          onClose={() => setFormOpen(false)}
          onSaved={load}
        />
      )}
    </>
  );
}
