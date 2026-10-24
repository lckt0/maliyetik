import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  DEFAULT_PREFERENCES, Density, LandingPage, PageSize, ThemeSetting,
  UI_SCALE_MAX, UI_SCALE_MIN, usePreferences,
} from '../preferences';
import { useDialog } from '../components/DialogProvider';
import { NotesPanel } from '../components/NotesPanel';
import { BellIcon, GaugeIcon, MoonIcon, NoteIcon, SettingsIcon, SparkleIcon, SunIcon, UserIcon } from '../components/Icons';

type Tab = 'appearance' | 'panel' | 'ai' | 'notifications' | 'notes';

const TABS: { key: Tab; label: string; icon: JSX.Element; hint: string }[] = [
  { key: 'appearance', label: 'Görünüm', icon: <SunIcon />, hint: 'Tema, arayüz ölçeği ve satır yoğunluğu.' },
  { key: 'panel', label: 'Panel', icon: <GaugeIcon />, hint: 'Açılış sayfası, liste boyutu ve kenar çubukları.' },
  { key: 'ai', label: 'Yapay Zeka', icon: <SparkleIcon />, hint: 'Yapay zeka deneyimini açın veya kapatın.' },
  { key: 'notifications', label: 'Bildirimler', icon: <BellIcon />, hint: 'Hangi durumlarda e-posta alacağınız.' },
  { key: 'notes', label: 'Notlar', icon: <NoteIcon />, hint: 'Notlarınız ve kurduğunuz hatırlatıcılar.' },
];

const THEME_OPTIONS: { value: ThemeSetting; label: string; hint: string }[] = [
  { value: 'light', label: 'Açık', hint: 'Her zaman açık tema' },
  { value: 'dark', label: 'Koyu', hint: 'Her zaman koyu tema' },
  { value: 'system', label: 'Sistem', hint: 'Cihazınızın ayarını izler' },
];

const SCALE_STEPS = [0.85, 0.925, 1, 1.1, 1.2, 1.4];

/**
 * Panel > Ayarlar — arayüz ölçeği, tema ve panel davranışları tek yerden.
 *
 * Tercihler `users.ui_preferences`'a yazılır (cihazlar arası senkron) ve anında
 * uygulanır — "Kaydet" düğmesi yok, her değişiklik o an yazılır. Rolden bağımsız:
 * mükellef, müşavir ve admin aynı sayfayı kullanır.
 */
export function Settings() {
  const { user } = useAuth();
  const { confirm } = useDialog();
  const prefs = usePreferences();
  const [tab, setTab] = useState<Tab>('appearance');

  const homePath = user?.role === 'admin' ? '/admin' : user?.role === 'accountant' ? '/musavir' : '/mukellef';

  return (
    <>
      <div className="section-head"><h2><SettingsIcon /> Ayarlar</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Panelin görünümünü ve davranışını kendinize göre ayarlayın. Değişiklikler anında uygulanır ve
        hesabınıza kaydedilir — başka bir cihazdan girdiğinizde de aynı ayarlarla açılır.
      </p>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: '-.5rem' }}>{TABS.find((t) => t.key === tab)?.hint}</p>

      {tab === 'appearance' && (
        <>
          <div className="card">
            <h3>Tema</h3>
            <p className="hint" style={{ marginTop: 0 }}>Panelin renk şeması.</p>
            <div className="setting-choices">
              {THEME_OPTIONS.map((o) => (
                <button key={o.value} type="button"
                  className={`setting-choice ${prefs.theme === o.value ? 'active' : ''}`}
                  onClick={() => prefs.setPreference('theme', o.value)}>
                  <span className="setting-choice-icon">
                    {o.value === 'dark' ? <MoonIcon /> : o.value === 'light' ? <SunIcon /> : <SettingsIcon />}
                  </span>
                  <b>{o.label}</b>
                  <span className="muted">{o.hint}</span>
                </button>
              ))}
            </div>
            {prefs.theme === 'system' && (
              <p className="hint">Cihazınız şu an <b>{prefs.resolvedTheme === 'dark' ? 'koyu' : 'açık'}</b> tema kullanıyor.</p>
            )}
          </div>

          <div className="card">
            <h3>Arayüz Ölçeği</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              Yazı ve bileşen boyutu. Küçük gelenler büyütebilir, ekrana daha çok veri sığdırmak isteyenler küçültebilir.
            </p>
            <div className="setting-row">
              <input type="range" min={UI_SCALE_MIN} max={UI_SCALE_MAX} step={0.025} value={prefs.uiScale}
                onChange={(e) => prefs.setPreference('uiScale', Number(e.target.value))}
                aria-label="Arayüz ölçeği" style={{ flex: 1, maxWidth: 320 }} />
              <b style={{ width: '4em' }}>%{Math.round(prefs.uiScale * 100)}</b>
            </div>
            <div className="note-quick-row" style={{ marginTop: '.5rem' }}>
              {SCALE_STEPS.map((v) => (
                <button key={v} type="button"
                  className={`btn sm ${Math.abs(prefs.uiScale - v) < 0.01 ? '' : 'secondary'}`}
                  onClick={() => prefs.setPreference('uiScale', v)}>%{Math.round(v * 100)}</button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Satır Yoğunluğu</h3>
            <p className="hint" style={{ marginTop: 0 }}>Tablolarda satır aralığı. &quot;Sık&quot; ekrana daha çok evrak sığdırır.</p>
            <div className="setting-choices">
              {([['comfortable', 'Rahat', 'Varsayılan aralık'], ['compact', 'Sık', 'Daha çok satır']] as [Density, string, string][]).map(([v, label, hint]) => (
                <button key={v} type="button" className={`setting-choice ${prefs.density === v ? 'active' : ''}`}
                  onClick={() => prefs.setPreference('density', v)}>
                  <b>{label}</b><span className="muted">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Hareket</h3>
            <label className="checkbox-field">
              <input type="checkbox" checked={prefs.reduceMotion}
                onChange={(e) => prefs.setPreference('reduceMotion', e.target.checked)} />
              Animasyonları azalt
            </label>
            <p className="hint">Geçiş efektleri kapatılır — hareket duyarlılığı veya yavaş cihazlar için.</p>
          </div>
        </>
      )}

      {tab === 'panel' && (
        <>
          <div className="card">
            <h3>Giriş Sonrası Açılacak Sayfa</h3>
            <div className="setting-choices">
              {([['home', 'Anasayfa', 'Panel özeti'], ['documents', 'Evraklar', 'Doğrudan evrak listesi'], ['upload', 'Evrak Yükle', 'Doğrudan yükleme']] as [LandingPage, string, string][]).map(([v, label, hint]) => (
                <button key={v} type="button" className={`setting-choice ${prefs.landingPage === v ? 'active' : ''}`}
                  onClick={() => prefs.setPreference('landingPage', v)}>
                  <b>{label}</b><span className="muted">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Listeler</h3>
            <div className="field" style={{ maxWidth: 220 }}>
              <label htmlFor="page-size">Sayfa başına satır</label>
              <select id="page-size" value={prefs.pageSize}
                onChange={(e) => prefs.setPreference('pageSize', Number(e.target.value) as PageSize)}>
                {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <p className="hint">Evraklar, çöp kutusu ve log listelerinde geçerlidir.</p>
          </div>

          <div className="card">
            <h3>Kenar Çubukları</h3>
            <label className="checkbox-field">
              <input type="checkbox" checked={prefs.sidebarLeftDocked}
                onChange={(e) => prefs.setPreference('sidebarLeftDocked', e.target.checked)} />
              Sol menü hep açık kalsın
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={prefs.sidebarRightDocked} disabled={prefs.hideRightSidebar}
                onChange={(e) => prefs.setPreference('sidebarRightDocked', e.target.checked)} />
              Sağ panel (favoriler, notlar) hep açık kalsın
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={prefs.hideRightSidebar}
                onChange={(e) => prefs.setPreference('hideRightSidebar', e.target.checked)} />
              Sağ paneli tamamen gizle
            </label>
          </div>

          <div className="card">
            <h3>Varsayılanlara Dön</h3>
            <p className="hint" style={{ marginTop: 0 }}>Tüm görünüm ve panel ayarları fabrika değerlerine döner.</p>
            <button type="button" className="btn secondary" onClick={async () => {
              if (await confirm('Tüm arayüz ayarları varsayılana dönsün mü?', { title: 'Varsayılanlara dön' })) {
                prefs.resetPreferences();
              }
            }}>
              Ayarları Sıfırla
            </button>
            <p className="hint">
              Varsayılan: sistem teması, %{Math.round(DEFAULT_PREFERENCES.uiScale * 100)} ölçek, rahat yoğunluk,
              sayfa başına {DEFAULT_PREFERENCES.pageSize} satır.
            </p>
          </div>
        </>
      )}

      {tab === 'ai' && (
        <>
          <div className="card">
            <h3>Yapay Zeka Deneyimi</h3>
            <label className="checkbox-field">
              <input type="checkbox" checked={prefs.aiExperience}
                onChange={(e) => prefs.setPreference('aiExperience', e.target.checked)} />
              Yapay zeka destekli özellikleri kullan
            </label>
            <p className="hint">
              Kapatırsanız aşağıdaki özellikler gizlenir; sistemin geri kalanı aynen çalışmaya
              devam eder. Bu ayar <b>Evrak Dijitalleştir&apos;deki yapay zekayı etkilemez</b> —
              o ayrı bir özelliktir ve AI kredisi tüketir.
            </p>
            <ul className="widget-list" style={{ marginTop: '.75rem' }}>
              <li><b>Doğal dille arama</b> — &quot;geçen ay gelen 5.000 TL üstü alış faturaları&quot; yazıp
                filtreyi otomatik kurar.</li>
              <li><b>Evrak akışı bulguları</b> — atlanan belge numarası, evraksız dönem, olağandışı
                tutar gibi durumları özetler. <span className="muted">Bulgular yapay zeka olmadan da
                hesaplanır; kapatınca yalnızca özet metni kaybolur.</span></li>
              <li><b>Akıllı yardımcı</b> — &quot;bunu nasıl yaparım&quot; sorularına panelden cevap verir.</li>
            </ul>
          </div>

          <div className="card">
            <h3>Gizlilik</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              Bu özelliklerde <b>evraklarınızın içeriği yapay zekaya gönderilmez</b>. Doğal dille
              aramada yalnızca yazdığınız cümle, bulgu özetinde yalnızca sayısal olgular (kaç evrak,
              hangi dönem), yardımcıda yalnızca sorunuz gönderilir. Evrak görselleri ve tutarlar
              yalnızca <b>Evrak Dijitalleştir</b>&apos;de, siz o işlemi başlattığınızda işlenir.
            </p>
          </div>
        </>
      )}

      {tab === 'notifications' && (
        <>
          <div className="card">
            <h3>E-posta Bildirimleri</h3>
            <label className="checkbox-field">
              <input type="checkbox" checked={prefs.emailReminders}
                onChange={(e) => prefs.setPreference('emailReminders', e.target.checked)} />
              Not hatırlatmalarını e-posta ile de gönder
            </label>
            <p className="hint">Kapalıyken hatırlatma yalnızca paneldeki zil bildirimi olarak düşer.</p>
            <label className="checkbox-field">
              <input type="checkbox" checked={prefs.emailDocumentActivity}
                onChange={(e) => prefs.setPreference('emailDocumentActivity', e.target.checked)} />
              Evrak hareketleri için e-posta gönder
            </label>
            <p className="hint">
              {user?.role === 'accountant'
                ? 'Mükellefiniz evrak yüklediğinde bilgilendirme e-postası alırsınız.'
                : 'Müşaviriniz evraklarınızda işlem yaptığında bilgilendirme e-postası alırsınız.'}
            </p>
          </div>

          <div className="card">
            <h3>Hesap ve Güvenlik</h3>
            <p className="hint" style={{ marginTop: 0 }}>
              Parola, e-posta, profil bilgileri ve paylaşım izinleri Hesabım sayfasında yönetilir.
            </p>
            <Link className="btn secondary" to="/hesap"><UserIcon /> Hesabıma Git</Link>
          </div>
        </>
      )}

      {tab === 'notes' && (
        <div className="card">
          <h3>Notlarım ve Hatırlatıcılar</h3>
          <p className="hint" style={{ marginTop: 0 }}>
            Notlarınız hesabınıza kayıtlıdır. Hatırlatma kurduğunuzda zamanı geldiğinde panelde bildirim alırsınız;
            e-posta tercihiniz açıksa e-posta da gönderilir.
          </p>
          <NotesPanel variant="full" />
          <p className="hint" style={{ marginTop: '1rem' }}>
            Notlara sağ kenar çubuğundan ve <Link to={homePath}>panel anasayfasından</Link> da ulaşabilirsiniz.
          </p>
        </div>
      )}
    </>
  );
}
