import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FolderIcon, GaugeIcon, PercentIcon, ScanIcon } from './Icons';

const FEATURES: { icon: ReactNode; text: string }[] = [
  { icon: <ScanIcon />, text: 'Evrakları saniyeler içinde dijitalleştirin ve otomatik sınıflandırın' },
  { icon: <FolderIcon />, text: 'Mükellef ve mali müşavir aynı panelde, tek tıkla ortak çalışsın' },
  { icon: <PercentIcon />, text: 'KDV hesaplamalarınızı otomatik ve hatasız yapın' },
  { icon: <GaugeIcon />, text: 'Kota bazlı kullanım ile ihtiyacınız kadar ödeyin' },
];

/** Login/Kayıt/Doğrulama sayfalarının ortak markalı sol paneli. */
export function AuthSide({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="auth-side">
      <Link to="/" className="auth-side-brand" style={{ color: '#fff' }}>
        <span className="brand-mark">M</span> Maliyetik
      </Link>
      <div>
        <div className="auth-side-title">{title}</div>
        <p className="auth-side-copy">{copy}</p>
      </div>
      <ul className="auth-side-features">
        {FEATURES.map((f) => (
          <li key={f.text}>{f.icon}<span>{f.text}</span></li>
        ))}
      </ul>
    </div>
  );
}
