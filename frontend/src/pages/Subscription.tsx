import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiError, apiGet, apiPost } from '../api/client';
import { useAuth } from '../auth';
import { useDialog } from '../components/DialogProvider';
import { Spinner } from '../components/Spinner';
import { CheckCircleIcon, GaugeIcon, SparkleIcon, WalletIcon } from '../components/Icons';
import { BillingSummary, PaymentRow, QuotaPackage, SubscriptionPlan } from '../types';
import { formatDate } from '../utils/date';
import { CheckoutSession, startCheckout } from '../utils/checkout';
import { SUPPORT_EMAIL } from '../site';

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Deneme sürümü',
  active: 'Aktif',
  past_due: 'Ödeme bekliyor',
  canceled: 'İptal edildi',
  expired: 'Süresi doldu',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor', paid: 'Ödendi', failed: 'Başarısız', refunded: 'İade edildi', cancelled: 'İptal',
};

const KIND_LABELS: Record<string, string> = {
  subscription: 'Abonelik', quota_package: 'Kota paketi', ai_credits: 'AI kredisi',
};

function money(v: string | number, currency = 'TRY'): string {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 });
}

/**
 * Aboneliğim — mevcut plan, plan değiştirme, ek kota paketi ve ödeme geçmişi.
 *
 * Sanal POS henüz bağlı değil: `paymentsEnabled` false geldiğinde satın alma düğmeleri
 * yerine "iletişime geçin" yönlendirmesi gösterilir — kullanıcı çalışmayan bir ödeme
 * ekranına düşmez. Sağlayıcı eklendiğinde bu sayfada değişiklik gerekmez.
 */
export function Subscription() {
  const { user } = useAuth();
  const { confirm } = useDialog();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [packages, setPackages] = useState<QuotaPackage[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [s, p, pk, pay] = await Promise.all([
        apiGet<BillingSummary>('/billing/me'),
        apiGet<SubscriptionPlan[]>('/billing/plans'),
        apiGet<QuotaPackage[]>('/billing/packages'),
        apiGet<PaymentRow[]>('/billing/payments'),
      ]);
      setSummary(s);
      setPlans(p);
      setPackages(pk);
      setPayments(pay);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function subscribe(planId: number) {
    setBusy(true);
    setError('');
    try {
      // Tüm planlar yıllık — dönem seçimi yok (bkz. billing.service periodEnd).
      // startCheckout sayfayı sağlayıcıya taşır; buradan sonrası ödeme dönüşünde
      // /odeme/sonuc sayfasında devam eder.
      startCheckout(await apiPost<CheckoutSession>('/billing/subscribe', { planId }));
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!await confirm('Aboneliğiniz dönem sonunda sona erecek. Devam edilsin mi?', { title: 'Aboneliği iptal et', danger: true, confirmLabel: 'İptal Et' })) return;
    setBusy(true);
    try {
      await apiPost('/billing/cancel');
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Abonelik bilgileri yükleniyor…" />;

  const ent = summary?.entitlements;
  const sub = summary?.subscription;
  const paymentsEnabled = summary?.paymentsEnabled ?? false;
  const isAccountant = user?.role === 'accountant';

  return (
    <>
      <div className="section-head"><h2><WalletIcon /> Aboneliğim</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        {isAccountant
          ? 'Mali müşavir planınız, yönetebileceğiniz mükellef sayısını ve aylık evrak kotanızı belirler.'
          : 'Planınız aylık evrak kotanızı ve AI dijitalleştirme kredinizi belirler. Kota biterse ek paket alabilirsiniz.'}
      </p>

      {error && <div className="alert error">{error}</div>}

      {!paymentsEnabled && (
        <div className="alert">
          Çevrim içi ödeme henüz etkin değil. Plan yükseltmek veya kota eklemek için
          <b> {SUPPORT_EMAIL}</b> adresinden bizimle iletişime geçin — hesabınıza elle tanımlarız.
        </div>
      )}

      <div className="card">
        <h3>Mevcut Plan</h3>
        {ent?.planName ? (
          <>
            <div className="grid cols-3">
              <div className="card">
                <h3>Plan</h3>
                <div className="stat small">{ent.planName}</div>
                <span className={`badge ${ent.status === 'active' || ent.status === 'trialing' ? 'active' : 'revoked'}`}>
                  {STATUS_LABELS[ent.status ?? ''] ?? ent.status}
                </span>
              </div>
              <div className="card">
                <h3>Dönem Sonu</h3>
                <div className="stat small">{formatDate(ent.periodEnd)}</div>
                {sub?.cancelAtPeriodEnd ? <p className="hint">Dönem sonunda sona erecek.</p> : null}
              </div>
              <div className="card">
                <h3>{isAccountant ? 'Mükellef Koltukları' : 'Plana Dahil'}</h3>
                <div className="stat small">
                  {isAccountant
                    ? `${ent.seatsUsed ?? 0} / ${ent.maxTaxpayers === 0 ? '∞' : ent.maxTaxpayers}`
                    : `${ent.includedQuota.toLocaleString('tr-TR')} evrak tavanı`}
                </div>
                {isAccountant ? (
                  <p className="hint">
                    {ent.seatsAvailable == null
                      ? 'Sınırsız mükellef'
                      : `${ent.seatsAvailable} koltuk boşta`}
                    {ent.quotaPerSeat > 0 && <> · mükellef başına {ent.quotaPerSeat.toLocaleString('tr-TR')} evrak</>}
                  </p>
                ) : (
                  <p className="hint">{ent.includedAiCredits.toLocaleString('tr-TR')} AI kredisi / yıl</p>
                )}
              </div>
            </div>
            {!sub?.cancelAtPeriodEnd && (
              <button type="button" className="btn secondary" disabled={busy} onClick={() => void cancel()}>
                Aboneliği İptal Et
              </button>
            )}
          </>
        ) : (
          <p className="muted">
            Henüz aktif bir aboneliğiniz yok. Aşağıdan size uygun planı seçebilirsiniz.
          </p>
        )}
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}>
        <h2>Planlar</h2>
        <span className="muted">Tüm planlar yıllıktır · fiyatlar KDV hariç</span>
      </div>
      {isAccountant && (
        <p className="hint" style={{ marginTop: '-.5rem' }}>
          Her koltuk bir mükellefe evrak tavanı taşır; <strong>mükellefleriniz ayrıca ücret ödemez</strong>.
          Kendi ücretli aboneliği olan bir mükellef koltuk tüketmez. Bir mükellefin yetkisini
          kaldırdığınızda koltuk aynı dönem içinde boşalır ve yeniden kullanılabilir; o mükellefin
          evrakları silinmez, arşiv moduna geçer.
        </p>
      )}

      <div className="grid cols-3">
        {plans.map((p) => {
          const isCurrent = ent?.planCode === p.code;
          const price = p.priceYearly;
          const isFree = Number(price) === 0;
          return (
            <div key={p.id} className={`card plan-card ${isCurrent ? 'current' : ''}`}>
              <h3 style={{ textTransform: 'none', fontSize: '1.05rem', color: 'var(--text)', letterSpacing: 0 }}>{p.name}</h3>
              {p.description && <p className="hint" style={{ marginTop: 0 }}>{p.description}</p>}
              <div className="plan-price">
                {isFree ? 'Ücretsiz' : money(price, p.currency)}
                {!isFree && <span className="muted">/yıl</span>}
              </div>
              <ul className="plan-features">
                {(p.features ?? []).map((f) => (
                  <li key={f}><CheckCircleIcon /> {f}</li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="badge active">Mevcut planınız</span>
              ) : paymentsEnabled ? (
                <button type="button" className="btn" style={{ width: '100%' }} disabled={busy}
                  onClick={() => void subscribe(p.id)}>
                  {isFree ? 'Ücretsiz Kademeye Geç'
                    : ent?.planName ? 'Bu Plana Geç'
                      : p.trialDays > 0 ? `${p.trialDays} Gün Ücretsiz Dene` : 'Satın Al'}
                </button>
              ) : (
                <a className="btn secondary" style={{ width: '100%', justifyContent: 'center' }}
                  href={`mailto:${SUPPORT_EMAIL}?subject=Plan%20talebi`}>Bilgi Al</a>
              )}
            </div>
          );
        })}
      </div>

      {!isAccountant && packages.length > 0 && (
        <>
          <div className="section-head" style={{ marginTop: '1.5rem' }}><h2><GaugeIcon /> Ek Kota Paketleri</h2></div>
          <p className="muted" style={{ marginTop: 0 }}>
            Evrak tavanınız dolduğunda ek paket alarak tavanı <b>kalıcı olarak</b> yükseltebilirsiniz.
            Paket kotası abonelik yenilemesinden etkilenmez.
          </p>
          <div className="grid cols-3">
            {packages.map((pk) => (
              <div key={pk.id} className="card plan-card">
                <h3 style={{ textTransform: 'none', fontSize: '1.05rem', color: 'var(--text)', letterSpacing: 0 }}>{pk.name}</h3>
                <div className="plan-price">{money(pk.price, pk.currency)}</div>
                <p className="muted">{Number(pk.quotaAmount).toLocaleString('tr-TR')} evrak kotası</p>
                {paymentsEnabled ? (
                  <Link className="btn secondary" style={{ width: '100%', justifyContent: 'center' }} to="/abonelik?sekme=kota">
                    Kota Sekmesinden Al
                  </Link>
                ) : (
                  <span className="hint">Ödeme etkinleştiğinde satın alınabilir.</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h2><SparkleIcon /> Ödeme Geçmişi</h2></div>
      <div className="table-wrap">
        <table className="compact">
          <thead><tr><th>Tarih</th><th>Açıklama</th><th>Tür</th><th style={{ textAlign: 'right' }}>Tutar</th><th>Durum</th></tr></thead>
          <tbody>
            {payments.length === 0 && (
              <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Henüz ödeme kaydı yok.</td></tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.paidAt ?? p.createdAt)}</td>
                <td>{p.description ?? '—'}</td>
                <td>{KIND_LABELS[p.kind] ?? p.kind}</td>
                <td style={{ textAlign: 'right' }}>{money(p.amount, p.currency)}</td>
                <td>
                  <span className={`badge ${p.status === 'paid' ? 'active' : p.status === 'failed' ? 'revoked' : ''}`}
                    title={p.failureReason ?? undefined}>
                    {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
