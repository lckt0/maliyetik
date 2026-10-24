import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, homePathFor } from '../../auth';
import { eksikYasalAlanlar } from '../../legal/firma';

/**
 * Yasal metin sayfalarının ortak kabuğu. Landing ile aynı görsel dili kullanır
 * (`.landing-*`), giriş gerektirmez.
 *
 * Taslak şeridi: firma.ts'teki köşeli parantezli alanlar doldurulmadığı sürece
 * sayfanın üstünde uyarı görünür — `[ŞİRKET UNVANI]` yazan bir sözleşme yanlışlıkla
 * yürürlükteymiş gibi sunulmasın diye.
 */
export function LegalShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const eksik = eksikYasalAlanlar();

  return (
    <div className="landing tool-page">
      <header className="landing-nav-bar">
        <div className="landing-nav">
          <Link to="/" className="landing-brand" style={{ color: 'inherit' }}>
            <span className="brand-mark">M</span> Maliyetik
          </Link>
          <nav className="landing-nav-links">
            <Link to="/yasal" className="landing-nav-link">Yasal Metinler</Link>
            {user ? (
              <Link to={homePathFor(user.role)} className="btn">Panele Git</Link>
            ) : (
              <Link to="/login" className="btn secondary">Giriş Yap</Link>
            )}
          </nav>
        </div>
      </header>

      <main className="tool-page-content legal-page">
        {eksik.length > 0 && (
          <div className="legal-draft-banner" role="status">
            <strong>Taslak.</strong> Bu metin henüz yürürlükte değildir: firma bilgileri
            doldurulmamış ({eksik.join(', ')}) ve hukuki inceleme tamamlanmamıştır.
          </div>
        )}
        {children}
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-col">
          <div className="landing-brand"><span className="brand-mark">M</span> Maliyetik</div>
          <p className="muted" style={{ maxWidth: 280 }}>
            Mükellefler ve mali müşavirler için bulut tabanlı mali evrak yönetim sistemi.
          </p>
        </div>
        <div className="landing-footer-col">
          <h4>Yasal</h4>
          <Link to="/yasal">Tüm Yasal Metinler</Link>
          <Link to="/yasal/kullanim-kosullari">Kullanım Koşulları</Link>
          <Link to="/yasal/gizlilik">Gizlilik Politikası</Link>
          <Link to="/yasal/aydinlatma">KVKK Aydınlatma</Link>
        </div>
        <div className="landing-footer-col">
          <h4>Hızlı Linkler</h4>
          <Link to="/">Anasayfa</Link>
          <Link to="/araclar">Ücretsiz Araçlar</Link>
          <Link to="/kayit">Kayıt Ol</Link>
        </div>
      </footer>
      <div className="landing-footer-bottom">© {new Date().getFullYear()} Maliyetik</div>
    </div>
  );
}
