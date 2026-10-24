import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, homePathFor } from '../auth';

/**
 * Ücretsiz araç sayfaları (KDV/Kredi/Desi/Stopaj/Gelir Vergisi Hesaplama) için ortak, herkese
 * açık kabuk. Landing page ile aynı görsel dil ve CSS sınıflarını (`.landing-*`) yeniden
 * kullanır — kimlik doğrulaması gerektirmez, giriş yapmış kullanıcılar için de erişilebilir.
 */
export function ToolPageLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const primaryTo = user ? homePathFor(user.role) : '/kayit';

  return (
    <div className="landing tool-page">
      <header className="landing-nav-bar">
        <div className="landing-nav">
          <Link to="/" className="landing-brand" style={{ color: 'inherit' }}>
            <span className="brand-mark">M</span> Maliyetik
          </Link>
          <nav className="landing-nav-links">
            <Link to="/araclar" className="landing-nav-link">Tüm Araçlar</Link>
            {user ? (
              <Link to={primaryTo} className="btn">Panele Git</Link>
            ) : (
              <>
                <Link to="/login" className="btn secondary">Giriş Yap</Link>
                <Link to="/kayit" className="btn">Kayıt Ol</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="tool-page-content">
        <div className="tool-page-inner">
          <Link to="/araclar" className="tool-page-breadcrumb">← Tüm Ücretsiz Araçlar</Link>
          {children}
        </div>
      </main>

      <section className="landing-cta">
        <div className="landing-cta-text" style={{ textAlign: 'center', margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 .5rem' }}>Evraklarınızı da tek panelden yönetin</h2>
          <p className="muted" style={{ marginBottom: '1.5rem' }}>
            Maliyetik ile evrak dijitalleştirme, KDV hesaplama ve mali müşavir iş birliğini tek yerde toplayın.
          </p>
          <Link to={primaryTo} className="btn" style={{ padding: '.8rem 1.6rem', fontSize: '1rem' }}>
            {user ? 'Panele Git' : 'Ücretsiz Kayıt Ol'}
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-col">
          <div className="landing-brand"><span className="brand-mark">M</span> Maliyetik</div>
          <p className="muted" style={{ maxWidth: 280 }}>Mükellefler ve mali müşavirler için bulut tabanlı mali evrak yönetim sistemi.</p>
        </div>
        <div className="landing-footer-col">
          <h4>Ücretsiz Araçlar</h4>
          <Link to="/araclar/kdv-hesaplama">KDV Hesaplama</Link>
          <Link to="/araclar/kredi-hesaplama">Kredi Hesaplama</Link>
          <Link to="/araclar/desi-hesaplama">Desi Hesaplama</Link>
          <Link to="/araclar/stopaj-hesaplama">Stopaj Hesaplama</Link>
          <Link to="/araclar/gelir-vergisi-hesaplama">Gelir Vergisi Hesaplama</Link>
        </div>
        <div className="landing-footer-col">
          <h4>Hesap</h4>
          <Link to="/kayit">Mükellef Kaydı</Link>
          <Link to="/kayit">Mali Müşavir Kaydı</Link>
          <Link to="/login">Giriş Yap</Link>
        </div>
              <div className="landing-footer-col">
          <h4>Yasal</h4>
          <Link to="/yasal/kullanim-kosullari">Kullanım Koşulları</Link>
          <Link to="/yasal/gizlilik">Gizlilik Politikası</Link>
          <Link to="/yasal">Tüm Yasal Metinler</Link>
        </div>
</footer>
      <div className="landing-footer-bottom">© {new Date().getFullYear()} Maliyetik</div>
    </div>
  );
}
