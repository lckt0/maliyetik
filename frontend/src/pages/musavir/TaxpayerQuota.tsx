import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { TaxpayerQuotaPanel } from '../../components/TaxpayerQuotaPanel';

/** Müşavir — üst bardan seçili mükellefin kota/AI kredi özeti + geçmişi. */
export function TaxpayerQuota() {
  const { activeTaxpayerId } = useAuth();

  if (!activeTaxpayerId) {
    return (
      <div className="card">
        <p>Devam etmek için önce bir mükellef seçin.</p>
        <Link className="btn" to="/musavir/mukellefler">Mükelleflerime Git</Link>
      </div>
    );
  }

  return (
    <>
      <div className="section-head"><h2>Mükellef Kota / AI Kredi</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Üst bardan seçili mükellefin kota ve AI kredi bakiyesi + geçmişi. Mükellef bu bilgileri
        Hesap sayfasından sizinle paylaşmayı kapatmışsa ilgili sekmede uyarı görürsünüz.
      </p>
      <TaxpayerQuotaPanel taxpayerId={activeTaxpayerId} />
    </>
  );
}
