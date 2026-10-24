import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiGet } from '../api/client';
import { homePathFor, useAuth } from '../auth';
import { bumpData } from '../dataBus';
import { PaymentRow } from '../types';
import { CheckCircleIcon, AlertCircleIcon } from '../components/Icons';
import { Spinner } from '../components/Spinner';
import { formatDateTime } from '../utils/date';

/**
 * Ödeme dönüş sayfası. Sağlayıcı `/api/v1/payments/callback` adresine POST atar, sunucu
 * sonucu doğrulayıp buraya 303 ile yönlendirir (bkz. payments.controller.ts).
 *
 * Sonuç URL'deki `durum` alanından OKUNMAZ — o yalnızca ilk gösterim içindir.
 * Doğrusu kendi ödeme kaydımızdan çekilir; tarayıcıdan gelen bir alanın "ödendi"
 * göstermesine izin verilmez.
 */
export function PaymentResult() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const paymentId = params.get('paymentId');
  const [payment, setPayment] = useState<PaymentRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiGet<PaymentRow[]>('/billing/payments')
      .then((rows) => {
        if (cancelled) return;
        setPayment(rows.find((r) => r.id === paymentId) ?? null);
        // Abonelik/kota göstergeleri bu sayfaya dönüldüğü anda tazelensin.
        bumpData('quota', 'documents');
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [paymentId]);

  const home = user ? homePathFor(user.role) : '/';

  if (loading) return <div className="card"><Spinner /> Ödeme sonucu alınıyor…</div>;

  if (!payment) {
    return (
      <div className="card" style={{ maxWidth: 520 }}>
        <h3>Ödeme kaydı bulunamadı</h3>
        <p className="muted">
          Kart hareketiniz gerçekleşmiş olabilir ancak sonucu eşleştiremedik. Lütfen
          Aboneliğim sayfasındaki ödeme geçmişini kontrol edin; görünmüyorsa bizimle iletişime geçin.
        </p>
        <Link className="btn" to={`${home}/abonelik`}>Aboneliğim</Link>
      </div>
    );
  }

  const paid = payment.status === 'paid';
  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
        {paid ? <CheckCircleIcon /> : <AlertCircleIcon />}
        {paid ? 'Ödemeniz alındı' : 'Ödeme tamamlanamadı'}
      </h3>
      <dl className="detail-list">
        <dt>Açıklama</dt><dd>{payment.description ?? '—'}</dd>
        <dt>Tutar</dt><dd>{payment.amount} {payment.currency}</dd>
        <dt>Tarih</dt><dd>{formatDateTime(payment.paidAt ?? payment.createdAt)}</dd>
        {!paid && payment.failureReason && (<><dt>Neden</dt><dd>{payment.failureReason}</dd></>)}
      </dl>
      <p className="muted">
        {paid
          ? 'Planınız etkinleştirildi. Kota ve yapay zeka kredileriniz hesabınıza tanımlandı.'
          : 'Tutar kartınızdan çekilmediyse bir işlem yapmanıza gerek yok. Tekrar denemek için Aboneliğim sayfasına dönebilirsiniz.'}
      </p>
      <Link className="btn" to={`${home}/abonelik`}>Aboneliğim</Link>
    </div>
  );
}
