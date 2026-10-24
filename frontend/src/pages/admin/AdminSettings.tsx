import { useEffect, useState } from 'react';
import { apiError, apiGet, apiPatch } from '../../api/client';
import { SystemSettings } from '../../types';
import { SettingsIcon, TrashIcon } from '../../components/Icons';
import { useDialog } from '../../components/DialogProvider';
import { SITE_HOST } from '../../site';

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="checkbox-field" style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem', marginBottom: '.9rem' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: '.2rem' }} />
      <span>
        <div>{label}</div>
        {hint && <div className="muted" style={{ fontWeight: 400, fontSize: '.78rem' }}>{hint}</div>}
      </span>
    </label>
  );
}

export function AdminSettings() {
  const { confirm } = useDialog();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [ipInput, setIpInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    apiGet<SystemSettings>('/admin/settings').then(setSettings).catch((e) => setMsg({ kind: 'error', text: apiError(e) }));
  }, []);

  function addIp() {
    const ip = ipInput.trim();
    if (!ip || !settings) return;
    if (settings.maintenanceAllowedIps.includes(ip)) { setIpInput(''); return; }
    setSettings({ ...settings, maintenanceAllowedIps: [...settings.maintenanceAllowedIps, ip] });
    setIpInput('');
  }

  function removeIp(ip: string) {
    if (!settings) return;
    setSettings({ ...settings, maintenanceAllowedIps: settings.maintenanceAllowedIps.filter((i) => i !== ip) });
  }

  async function save() {
    if (!settings) return;
    if (settings.maintenanceMode) {
      const ok = await confirm(
        'Bakım modunu etkinleştirmek üzeresiniz. Listelenen IP\'ler dışındaki tüm kullanıcılar sistemden çıkarılacak. Devam edilsin mi?',
        { danger: true, confirmLabel: 'Etkinleştir' },
      );
      if (!ok) return;
    }

    setBusy(true); setMsg(null);
    try {
      const saved = await apiPatch<SystemSettings>('/admin/settings', {
        registrationEnabled: settings.registrationEnabled,
        taxpayerApprovalRequired: settings.taxpayerApprovalRequired,
        accountantApprovalRequired: settings.accountantApprovalRequired,
        maintenanceMode: settings.maintenanceMode,
        maintenanceAllowedIps: settings.maintenanceAllowedIps,
        taxpayerAiEnabled: settings.taxpayerAiEnabled,
        accountantAiEnabled: settings.accountantAiEnabled,
        taxpayerMobileAppEnabled: settings.taxpayerMobileAppEnabled,
        accountantMobileAppEnabled: settings.accountantMobileAppEnabled,
        adminMobileAppEnabled: settings.adminMobileAppEnabled,
      });
      setSettings(saved);
      setMsg({ kind: 'success', text: 'Ayarlar kaydedildi.' });
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) return <p className="muted">Yükleniyor…</p>;

  return (
    <>
      <div className="section-head"><h2><SettingsIcon /> Sistem Ayarları</h2></div>

      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <div className="card" style={{ maxWidth: 640, marginBottom: '1.5rem' }}>
        <h3>Kayıt Olma</h3>
        <Toggle
          checked={settings.registrationEnabled}
          onChange={(v) => setSettings({ ...settings, registrationEnabled: v })}
          label="Yeni kayıtlara izin ver"
          hint="Kapatıldığında /kayit sayfası yeni hesap oluşturmayı reddeder."
        />
        <Toggle
          checked={settings.taxpayerApprovalRequired}
          onChange={(v) => setSettings({ ...settings, taxpayerApprovalRequired: v })}
          label="Mükellef kayıtları admin onayı gerektirsin"
          hint="E-postasını doğrulayan mükellefler, onaylanana kadar giriş yapamaz."
        />
        <Toggle
          checked={settings.accountantApprovalRequired}
          onChange={(v) => setSettings({ ...settings, accountantApprovalRequired: v })}
          label="Mali müşavir kayıtları admin onayı gerektirsin"
          hint="E-postasını doğrulayan mali müşavirler, onaylanana kadar giriş yapamaz."
        />
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <h3>Bakım Modu</h3>
        <Toggle
          checked={settings.maintenanceMode}
          onChange={(v) => setSettings({ ...settings, maintenanceMode: v })}
          label="Bakım modunu etkinleştir"
          hint="Etkinken, aşağıdaki IP'ler dışında kimse sisteme erişemez ve bakım sayfası gösterilir. Kendi IP'niz otomatik eklenir."
        />
        <div className="field">
          <label>İzin Verilen IP Adresleri</label>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <input value={ipInput} onChange={(e) => setIpInput(e.target.value)} placeholder="ör. 88.12.34.56"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIp(); } }} />
            <button type="button" className="btn secondary" onClick={addIp}>Ekle</button>
          </div>
        </div>
        {settings.maintenanceAllowedIps.length === 0 && <p className="muted">Henüz IP eklenmedi.</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
          {settings.maintenanceAllowedIps.map((ip) => (
            <span key={ip} className="badge active" style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}>
              {ip}
              <button type="button" className="icon-btn sm" onClick={() => removeIp(ip)} title="Kaldır" style={{ width: 16, height: 16 }}>
                <TrashIcon width={11} height={11} />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640, marginTop: '1.5rem' }}>
        <h3>Yapay Zeka</h3>
        <Toggle
          checked={settings.taxpayerAiEnabled}
          onChange={(v) => setSettings({ ...settings, taxpayerAiEnabled: v })}
          label="Mükellefler yapay zeka kullanabilir"
          hint="Kapatıldığında mükellef hesapları Evrak Dijitalleştir (AI) sayfasını ve AI ile otomatik dijitalleştirmeyi kullanamaz."
        />
        <Toggle
          checked={settings.accountantAiEnabled}
          onChange={(v) => setSettings({ ...settings, accountantAiEnabled: v })}
          label="Mali müşavirler yapay zeka kullanabilir"
          hint="Kapatıldığında mali müşavir hesapları Evrak Dijitalleştir (AI) sayfasını ve AI ile otomatik dijitalleştirmeyi kullanamaz."
        />
      </div>

      <div className="card" style={{ maxWidth: 640, marginTop: '1.5rem' }}>
        <h3>Mobil Uygulama</h3>
        <p className="hint" style={{ margin: '0 0 .75rem' }}>
          Mobil uygulama (<code>{SITE_HOST}/app</code>) rol bazında açılıp kapatılır.
          Kapatılan roldeki hesaplar mobilde giriş yapamaz; web paneli etkilenmez.
        </p>
        <Toggle
          checked={settings.taxpayerMobileAppEnabled}
          onChange={(v) => setSettings({ ...settings, taxpayerMobileAppEnabled: v })}
          label="Mükellefler mobil uygulamayı kullanabilir"
          hint="Kapatıldığında mükellef hesapları mobil uygulamada giriş yapamaz."
        />
        <Toggle
          checked={settings.accountantMobileAppEnabled}
          onChange={(v) => setSettings({ ...settings, accountantMobileAppEnabled: v })}
          label="Mali müşavirler mobil uygulamayı kullanabilir"
          hint="Mobilde önce bir mükellef seçerler; evrak listeleme, tarama ve şirket evrakları o mükellef adına çalışır."
        />
        <Toggle
          checked={settings.adminMobileAppEnabled}
          onChange={(v) => setSettings({ ...settings, adminMobileAppEnabled: v })}
          label="Adminler mobil uygulamayı kullanabilir"
          hint="Admin mobilde tüm mükellefler arasından arayarak seçim yapabilir."
        />
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button type="button" className="btn" disabled={busy} onClick={save}>
          {busy ? 'Kaydediliyor…' : 'Ayarları Kaydet'}
        </button>
      </div>
    </>
  );
}
