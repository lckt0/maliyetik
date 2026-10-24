import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, homePathFor } from '../auth';
import { usePreferences } from '../preferences';
import { apiGet } from '../api/client';
import { QuotaPackage, SubscriptionPlan } from '../types';
import { RollingNumber } from '../components/RollingNumber';
import { HandshakeIllustration, OfficeDeskIllustration } from '../components/LandingIllustrations';
import { ScrollReveal } from '../components/ScrollReveal';
import {
  BuildingIcon, CheckCircleIcon, ClockIcon, FolderIcon, GaugeIcon, MegaphoneIcon, MoonIcon, PercentIcon,
  ScanIcon, SearchIcon, ShieldIcon, SunIcon, UsersIcon,
} from '../components/Icons';

const PROCESSED_DOCS_START = 2480;

/** Salt görsel amaçlı "canlı" sayaç — vitrin panelindeki mock istatistik, saniyede bir 15-20 arası rastgele artar. */
function useLiveCounter(start: number): number {
  const [value, setValue] = useState(start);
  useEffect(() => {
    const timer = setInterval(() => {
      setValue((v) => v + Math.floor(Math.random() * 6) + 15);
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return value;
}

const FEATURES = [
  { icon: <ScanIcon />, title: 'Evrak Dijitalleştirme', text: 'Fatura, makbuz, çek ve diğer mali evrakları hızlıca yükleyin; sistem türüne göre otomatik sınıflandırıp arşivler.' },
  { icon: <UsersIcon />, title: 'Mükellef & Mali Müşavir Paneli', text: 'Mükellefler ve mali müşavirler aynı platformda, yetkilendirme ile ortak çalışır — evraklar tek yerde toplanır.' },
  { icon: <PercentIcon />, title: 'Otomatik KDV Hesaplama', text: 'Yüklenen evraklardan otomatik olarak KDV özetleri ve dönemsel net hesaplamalar çıkarılır.' },
  { icon: <GaugeIcon />, title: 'Kota Bazlı Kullanım', text: 'İhtiyacınıza göre kota tahsis edilir; kullanım şeffaf bir şekilde takip edilir.' },
  { icon: <BuildingIcon />, title: 'Şirket Evrakları Arşivi', text: 'İmza sirküsü, vergi levhası, ticaret sicil gazetesi gibi kurumsal belgeler ayrı bir arşivde, eksik olanlar vurgulanarak saklanır.' },
  { icon: <MegaphoneIcon />, title: 'Sistem Duyuruları', text: 'Önemli güncellemeler ve duyurular, tüm kullanıcılara anlık bildirim ve panel üzerinden ulaşır.' },
];

const ADVANCED_FEATURES = [
  { icon: <SearchIcon />, title: 'Gelişmiş Filtreleme & Arama', text: 'Tarih, tutar, VKN, belge no ve türe göre saniyeler içinde binlerce evrak arasında arayın.' },
  { icon: <GaugeIcon />, title: 'Hızlı & Mobil Uyumlu', text: 'Panel, masaüstü ve mobil cihazlarda akıcı çalışacak şekilde tasarlandı.' },
  { icon: <ClockIcon />, title: 'Tam Denetim İzi', text: 'Her ekleme, düzenleme ve silme işlemi kim tarafından yapıldığıyla birlikte kayıt altına alınır.' },
  { icon: <UsersIcon />, title: 'Çoklu Mükellef Desteği', text: 'Mali müşavirler, yetkilendirildikleri tüm mükellefler arasında tek panelden geçiş yapar.' },
];

const WHY_US = [
  { icon: <CheckCircleIcon />, title: 'Kolay Kullanım', text: 'Sade arayüz, öğrenme eğrisi olmadan dakikalar içinde kullanmaya başlayın.' },
  { icon: <GaugeIcon />, title: 'Hızlı Performans', text: 'Milyonlarca evrak kaydı hedeflenen bir altyapı üzerinde çalışır.' },
  { icon: <ShieldIcon />, title: 'Güvenli Platform', text: 'Rol bazlı yetkilendirme, denetim izi ve şifreli depolama ile verileriniz korunur.' },
  { icon: <FolderIcon />, title: 'Tek Panelde Ortak Çalışma', text: 'Mükellef ve mali müşavir aynı evrak arşivinde, yetkilendirme ile birlikte çalışır.' },
];

const STEPS = [
  { n: '1', title: 'Kayıt Olun', text: 'Mükellef veya mali müşavir olarak birkaç dakikada hesap oluşturun ve e-postanızı doğrulayın.' },
  { n: '2', title: 'Evraklarınızı Yükleyin', text: 'Fatura, makbuz ve diğer evraklarınızı yükleyin veya hızlı kayıt ile sıraya alın.' },
  { n: '3', title: 'Yönetin ve Raporlayın', text: 'Evraklarınızı sorgulayın, KDV hesaplamalarınızı görüntüleyin, mali müşavirinizle paylaşın.' },
];

function fmtPrice(price: string, currency: string): string {
  return `${Number(price).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ${currency}`;
}

const LANDING_TITLE = 'Maliyetik — Mali Evrak Yönetimi ve Mükellef/Mali Müşavir Paneli';

export function Landing() {
  // Panelden çıkışta (ör. oturum kapatma) başlık panel sayfasında asılı kalmasın:
  // anasayfanın kendi SEO başlığı geri yazılır.
  useEffect(() => { document.title = LANDING_TITLE; }, []);
  const { user } = useAuth();
  // `resolvedTheme`: kullanıcı 'sistem' seçtiyse o an gerçekten uygulanan tema.
  const { resolvedTheme, toggleTheme } = usePreferences();
  const [packages, setPackages] = useState<QuotaPackage[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  // Fiyat tablosu iki kitleye birden hitap ediyor; ziyaretçi hangisi olduğunu seçer.
  const [audience, setAudience] = useState<'taxpayer' | 'accountant'>('taxpayer');
  const processedDocs = useLiveCounter(PROCESSED_DOCS_START);
  const primaryTo = user ? homePathFor(user.role) : '/kayit';
  const primaryLabel = user ? 'Panele Git' : 'Ücretsiz Kayıt Ol';

  useEffect(() => { apiGet<QuotaPackage[]>('/quota-packages').then(setPackages).catch(() => setPackages([])); }, []);
  useEffect(() => { apiGet<SubscriptionPlan[]>('/plans').then(setPlans).catch(() => setPlans([])); }, []);

  return (
    <div className="landing">
      <header className="landing-nav-bar">
        <div className="landing-nav">
          <div className="landing-brand">
            <span className="brand-mark">M</span> Maliyetik
          </div>
          <nav className="landing-nav-links">
            <a href="#ozellikler" className="landing-nav-link">Özellikler</a>
            <a href="#fiyatlar" className="landing-nav-link">Fiyatlar</a>
            <a href="#nasil-calisir" className="landing-nav-link">Nasıl Çalışır</a>
            <button
              type="button"
              className="icon-btn landing-theme-toggle"
              onClick={toggleTheme}
              title={resolvedTheme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
            >
              {resolvedTheme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
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

      <section className="landing-hero">
        <div className="landing-hero-text">
          <h1>Mali evraklarınızı tek panelden yönetin</h1>
          <p className="landing-hero-sub">
            Maliyetik; mükellefler ve mali müşavirler için evrak dijitalleştirme, otomatik KDV hesaplama
            ve ortak çalışma alanı sunan bulut tabanlı bir mali evrak yönetim sistemidir.
          </p>
          <div className="landing-hero-actions">
            {user ? (
              <Link to={primaryTo} className="btn" style={{ padding: '.8rem 1.6rem', fontSize: '1rem' }}>{primaryLabel}</Link>
            ) : (
              <a href="#ozellikler" className="btn" style={{ padding: '.8rem 1.6rem', fontSize: '1rem' }}>Daha Fazlasını Öğren</a>
            )}
          </div>
        </div>
        <div className="landing-hero-visual">
          <OfficeDeskIllustration className="landing-illustration" aria-hidden="true" />
          <div className="landing-mock-panel" aria-hidden="true">
            <div className="landing-mock-row landing-mock-head">
              <span className="landing-mock-dot" /><span className="landing-mock-dot" /><span className="landing-mock-dot" />
            </div>
            <div className="landing-mock-stat">
              <GaugeIcon />
              <div>
                <b><RollingNumber value={processedDocs} format={(n) => n.toLocaleString('tr-TR')} /></b>
                <span>evrak işlendi</span>
              </div>
            </div>
            <div className="landing-mock-bar"><div style={{ width: '78%' }} /></div>
            <div className="landing-mock-bar"><div style={{ width: '45%' }} /></div>
            <div className="landing-mock-bar"><div style={{ width: '92%' }} /></div>
          </div>
        </div>
      </section>

      <section className="landing-section" id="ozellikler">
        <ScrollReveal className="landing-section-inner">
          <h2 className="landing-section-title">Neler Sunuyoruz</h2>
          <div className="grid cols-3 landing-features">
            {FEATURES.map((f) => (
              <div key={f.title} className="card">
                <div className="landing-feature-icon">{f.icon}</div>
                <h3 style={{ textTransform: 'none', fontSize: '1rem', color: 'var(--text)', letterSpacing: 0 }}>{f.title}</h3>
                <p className="muted" style={{ margin: 0 }}>{f.text}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      <section className="landing-section landing-alt-section">
        <ScrollReveal className="landing-section-inner">
          <h2 className="landing-section-title">Gelişmiş Özellikler</h2>
          <div className="grid cols-4 landing-features">
            {ADVANCED_FEATURES.map((f) => (
              <div key={f.title} className="card">
                <div className="landing-feature-icon">{f.icon}</div>
                <h3 style={{ textTransform: 'none', fontSize: '.95rem', color: 'var(--text)', letterSpacing: 0 }}>{f.title}</h3>
                <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>{f.text}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      <section className="landing-section">
        <ScrollReveal className="landing-section-inner">
          <h2 className="landing-section-title">Neden Maliyetik?</h2>
          <div className="grid cols-4 landing-features">
            {WHY_US.map((f) => (
              <div key={f.title} className="card">
                <div className="landing-feature-icon">{f.icon}</div>
                <h3 style={{ textTransform: 'none', fontSize: '.95rem', color: 'var(--text)', letterSpacing: 0 }}>{f.title}</h3>
                <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>{f.text}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      <section className="landing-section landing-steps-section" id="nasil-calisir">
        <ScrollReveal className="landing-section-inner">
          <h2 className="landing-section-title">Nasıl Çalışır</h2>
          <div className="grid cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="landing-step">
                <div className="landing-step-num">{s.n}</div>
                <h3 style={{ fontSize: '1rem', color: 'var(--text)', textTransform: 'none', letterSpacing: 0 }}>{s.title}</h3>
                <p className="muted">{s.text}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {(plans.length > 0 || packages.length > 0) && (
        <section className="landing-section" id="fiyatlar">
          <ScrollReveal className="landing-section-inner">
            <h2 className="landing-section-title">Fiyatlandırma</h2>
            <p className="muted" style={{ textAlign: 'center', margin: '-1rem auto 1.5rem', maxWidth: 520 }}>
              Mükellefler ve mali müşavirler için ayrı planlar. Tüm planlar <b>yıllıktır</b> ve
              ücretsiz denemeyle başlar. Fiyatlar KDV hariçtir.
            </p>

            <div className="landing-pricing-toggles">
              <div className="tabs" role="tablist" style={{ margin: 0 }}>
                <button type="button" role="tab" aria-selected={audience === 'taxpayer'}
                  className={`tab ${audience === 'taxpayer' ? 'active' : ''}`} onClick={() => setAudience('taxpayer')}>
                  Mükellef
                </button>
                <button type="button" role="tab" aria-selected={audience === 'accountant'}
                  className={`tab ${audience === 'accountant' ? 'active' : ''}`} onClick={() => setAudience('accountant')}>
                  Mali Müşavir
                </button>
              </div>
            </div>

            <div className="grid cols-3 landing-pricing">
              {plans.filter((p) => p.audience === audience).map((p, i) => (
                <div key={p.id} className={`card landing-price-card ${i === 1 ? 'featured' : ''}`}>
                  {i === 1 && <span className="landing-price-badge">En Popüler</span>}
                  <h3 style={{ textTransform: 'none', fontSize: '1.1rem', color: 'var(--text)', letterSpacing: 0 }}>{p.name}</h3>
                  <div className="landing-price-amount">
                    {Number(p.priceYearly) === 0 ? 'Ücretsiz' : fmtPrice(p.priceYearly, p.currency)}
                    {Number(p.priceYearly) > 0 && (
                      <span className="muted" style={{ fontSize: '.85rem', fontWeight: 400 }}>/yıl</span>
                    )}
                  </div>
                  <p className="muted" style={{ margin: '.25rem 0 .75rem' }}>{p.description}</p>
                  <ul className="plan-features">
                    {(p.features ?? []).map((f) => <li key={f}><CheckCircleIcon /> {f}</li>)}
                  </ul>
                  <Link to={primaryTo} className="btn" style={{ width: '100%', justifyContent: 'center' }}>
                    {user ? 'Panele Git'
                      : Number(p.priceYearly) === 0 ? 'Ücretsiz Başla'
                        : p.trialDays > 0 ? `${p.trialDays} Gün Ücretsiz Dene` : 'Kayıt Ol'}
                  </Link>
                </div>
              ))}
            </div>

            {packages.length > 0 && (
              <>
                <h3 style={{ textAlign: 'center', marginTop: '2.5rem' }}>Ek Kota Paketleri</h3>
                <p className="muted" style={{ textAlign: 'center', margin: '0 auto 1.5rem', maxWidth: 480 }}>
                  Evrak tavanınız dolarsa ek paketle tavanı kalıcı olarak yükseltebilirsiniz.
                </p>
                <div className="grid cols-3 landing-pricing">
                  {packages.map((p) => (
                    <div key={p.id} className="card landing-price-card">
                      <h3 style={{ textTransform: 'none', fontSize: '1.05rem', color: 'var(--text)', letterSpacing: 0 }}>{p.name}</h3>
                      <div className="landing-price-amount">{fmtPrice(p.price, p.currency)}</div>
                      <p className="muted" style={{ margin: '.25rem 0 1.25rem' }}>
                        {Number(p.quotaAmount).toLocaleString('tr-TR')} evrak kotası
                      </p>
                      <Link to={primaryTo} className="btn secondary" style={{ width: '100%', justifyContent: 'center' }}>
                        {user ? 'Panele Git' : 'Kayıt Ol'}
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ScrollReveal>
        </section>
      )}

      <section className="landing-cta">
        <ScrollReveal className="landing-cta-inner">
          <div className="landing-cta-text">
            <h2 style={{ margin: '0 0 .5rem' }}>Hemen başlayın</h2>
            <p className="muted" style={{ marginBottom: '1.5rem' }}>Kayıt olmak ücretsizdir, kurulum gerektirmez.</p>
            <Link to={primaryTo} className="btn" style={{ padding: '.8rem 1.6rem', fontSize: '1rem' }}>{primaryLabel}</Link>
          </div>
          <HandshakeIllustration className="landing-cta-illustration" aria-hidden="true" />
        </ScrollReveal>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-col">
          <div className="landing-brand"><span className="brand-mark">M</span> Maliyetik</div>
          <p className="muted" style={{ maxWidth: 280 }}>Mükellefler ve mali müşavirler için bulut tabanlı mali evrak yönetim sistemi.</p>
        </div>
        <div className="landing-footer-col">
          <h4>Hızlı Linkler</h4>
          <a href="#ozellikler">Özellikler</a>
          <a href="#fiyatlar">Fiyatlar</a>
          <Link to="/login">Giriş Yap</Link>
          <Link to="/kayit">Kayıt Ol</Link>
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
        </div>
        <div className="landing-footer-col">
          <h4>Yasal</h4>
          <Link to="/yasal/kullanim-kosullari">Kullanım Koşulları</Link>
          <Link to="/yasal/gizlilik">Gizlilik Politikası</Link>
          <Link to="/yasal/aydinlatma">KVKK Aydınlatma</Link>
          <Link to="/yasal/mesafeli-satis">Mesafeli Satış</Link>
          <Link to="/yasal">Tümü</Link>
        </div>
      </footer>
      <div className="landing-footer-bottom">© {new Date().getFullYear()} Maliyetik</div>
    </div>
  );
}
