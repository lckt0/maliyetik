import { Link } from 'react-router-dom';
import { ToolPageLayout } from '../../components/ToolPageLayout';
import { useSeoMeta } from '../../hooks';
import { GaugeIcon, PercentIcon, ScanIcon, ShieldIcon, WalletIcon } from '../../components/Icons';

const TOOLS = [
  { to: '/araclar/kdv-hesaplama', icon: <PercentIcon />, title: 'KDV Hesaplama', text: 'KDV dahil/hariç tutarları %1, %10 ve %20 oranlarıyla hesaplayın.' },
  { to: '/araclar/kredi-hesaplama', icon: <WalletIcon />, title: 'Kredi Hesaplama', text: 'Aylık taksit, toplam geri ödeme ve toplam faizi ödeme planıyla hesaplayın.' },
  { to: '/araclar/desi-hesaplama', icon: <ScanIcon />, title: 'Desi Hesaplama', text: 'Koli ölçülerinize göre kargo desi (hacimsel ağırlık) değerini hesaplayın.' },
  { to: '/araclar/stopaj-hesaplama', icon: <ShieldIcon />, title: 'Stopaj Hesaplama', text: 'Kira ve serbest meslek ödemelerinizde kesilecek stopajı ve net tutarı hesaplayın.' },
  { to: '/araclar/gelir-vergisi-hesaplama', icon: <GaugeIcon />, title: 'Gelir Vergisi Hesaplama', text: 'Yıllık gelirinize göre dilimli gelir vergisi tutarınızı hesaplayın.' },
];

export function ToolsHub() {
  useSeoMeta({
    title: 'Ücretsiz Mali Araçlar — KDV, Kredi, Desi, Stopaj, Gelir Vergisi Hesaplama | Maliyetik',
    description: 'Maliyetik\'in ücretsiz online hesaplama araçları: KDV, kredi, desi, stopaj ve gelir vergisi hesaplama. Kayıt gerektirmez, herkes kullanabilir.',
    path: '/araclar',
  });

  return (
    <ToolPageLayout>
      <h1>Ücretsiz Mali Araçlar</h1>
      <p className="muted">
        Kayıt olmadan, herkesin ücretsiz kullanabileceği hesaplama araçları. Mali müşavirinizle
        paylaşmadan önce hızlıca bir ön hesaplama yapmak isterseniz bu araçlar tam size göre.
      </p>
      <div className="grid cols-3 landing-features">
        {TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="card">
            <div className="landing-feature-icon">{t.icon}</div>
            <h3 style={{ textTransform: 'none', fontSize: '1rem', color: 'var(--text)', letterSpacing: 0 }}>{t.title}</h3>
            <p className="muted" style={{ margin: 0 }}>{t.text}</p>
          </Link>
        ))}
      </div>
    </ToolPageLayout>
  );
}
