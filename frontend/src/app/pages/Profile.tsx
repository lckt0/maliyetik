import { useEffect, useState } from 'react';
import { apiError, apiGet } from '../../api/client';
import { useAuth } from '../../auth';
import { QuotaSummary, Role } from '../../types';
import { AlertCircleIcon, BuildingIcon, LogoutIcon, MoonIcon, SunIcon, SettingsIcon } from '../../components/Icons';
import { MobilePage } from '../shell/MobileShell';
import { ConfirmSheet } from '../shell/Sheet';
import { TaxpayerPicker } from '../shell/TaxpayerPicker';
import { InstallHint } from '../shell/InstallHint';
import { useTheme } from '../theme';
import { SITE_HOST } from '../../site';

const ROLE_LABEL: Record<Role, string> = {
  taxpayer: 'Mükellef',
  accountant: 'Mali Müşavir',
  admin: 'Admin',
};

function initials(fullName?: string, email?: string): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const fromName = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (fromName || email?.[0] || '?').toUpperCase();
}

/**
 * Aktif mükellefin kota özetini getirir. Uç role göre değişiyor — her rol kendi
 * yetkisine uygun ucu kullanmalı, aksi halde 403 alınır:
 *   mükellef  → /quota/me                        (kendi profili)
 *   müşavir   → /quota/taxpayer/:id              (yetkili olduğu mükellef; mükellef bunu
 *                                                 Hesap sayfasından kapatabilir → 403)
 *   admin     → /admin/quota/balance/:id         (kısıtsız)
 */
function quotaEndpoint(role: Role, taxpayerId: string | null): string | null {
  if (role === 'taxpayer') return '/quota/me';
  if (!taxpayerId) return null;
  return role === 'admin' ? `/admin/quota/balance/${taxpayerId}` : `/quota/taxpayer/${taxpayerId}`;
}

export function Profile() {
  const { user, profile, logout, activeTaxpayerId } = useAuth();
  const { choice, setChoice } = useTheme();
  const [quota, setQuota] = useState<QuotaSummary | null>(null);
  const [quotaError, setQuotaError] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [picking, setPicking] = useState(false);

  const role = user?.role ?? 'taxpayer';
  const needsContext = role === 'accountant' || role === 'admin';

  useEffect(() => {
    const url = quotaEndpoint(role, activeTaxpayerId);
    if (!url) { setQuota(null); return; }
    setQuota(null); setQuotaError('');
    apiGet<QuotaSummary>(url).then(setQuota).catch((e) => setQuotaError(apiError(e)));
  }, [role, activeTaxpayerId]);

  const usedPct = quota && quota.limit > 0
    ? Math.min(100, Math.round((quota.used / quota.limit) * 100))
    : 0;
  const level = !quota ? '' : quota.remaining <= 0 ? 'out' : quota.remaining < quota.limit * 0.1 ? 'low' : '';

  return (
    <MobilePage title="Profil">
      <div className="m-profile-head">
        <div className="m-avatar">
          {profile?.avatarUrl
            ? <img src={profile.avatarUrl} alt="" />
            : initials(profile?.fullName ?? user?.fullName, profile?.email ?? user?.email)}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{profile?.fullName ?? user?.fullName ?? ROLE_LABEL[role]}</h2>
          <p className="m-hint" style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {profile?.email ?? user?.email}
          </p>
        </div>
      </div>

      <div className="m-card">
        <h3>{needsContext ? 'Seçili Mükellefin Kotası' : 'Evrak Kotası'}</h3>
        {quotaError && (
          // Müşavir için bu genelde hata değil bir tercih: mükellef kota bilgisini
          // paylaşmayı kapatmış olabilir (Hesap → müşavir görünürlüğü). Kırmızı hata
          // kutusu göstermek her açılışta bozukmuş izlenimi verirdi.
          <div className={`m-alert ${needsContext ? 'info' : 'error'}`} style={{ marginBottom: 0 }}>
            <AlertCircleIcon width={18} height={18} /><span>{quotaError}</span>
          </div>
        )}
        {!quota && !quotaError && <div className="m-loading" style={{ padding: '.5rem' }}><span className="m-spinner" /></div>}
        {quota && (
          <>
            <div className="m-quota-bar">
              <div className={`m-quota-fill ${level}`} style={{ width: `${usedPct}%` }} />
            </div>
            <p className="m-hint" style={{ margin: 0 }}>
              {quota.used.toLocaleString('tr-TR')} / {quota.limit.toLocaleString('tr-TR')} evrak kullanıldı
              {' · '}<strong>{quota.remaining.toLocaleString('tr-TR')}</strong> kaldı
            </p>
            <p className="m-hint" style={{ margin: '.5rem 0 0' }}>
              Çöp kutusundaki evraklar da sayılır; kalıcı silmede kota iade edilir.
            </p>
            {/* Arşiv modu "kota doldu"dan farklı bir durum: hak bitmedi, hiç hak yok.
                Aynı uyarıyı göstermek kullanıcıyı gereksizce kota satın almaya iterdi. */}
            {quota.archived && (
              <div className="m-alert warning" style={{ marginTop: '.75rem', marginBottom: 0 }}>
                <AlertCircleIcon width={18} height={18} />
                <span>
                  Arşiv modundasınız — evraklarınız duruyor, görüntüleyip indirebilirsiniz;
                  yalnızca yeni yükleme durdu. Bir mali müşavire yetki verdiğinizde devam eder.
                </span>
              </div>
            )}
            {!quota.archived && quota.remaining <= 0 && (
              <div className="m-alert warning" style={{ marginTop: '.75rem', marginBottom: 0 }}>
                <AlertCircleIcon width={18} height={18} />
                <span>Kota doldu — yeni evrak yüklenemez. Web panelinden kota yükseltilebilir.</span>
              </div>
            )}
          </>
        )}
      </div>

      {needsContext && (
        <div className="m-card">
          <h3>Aktif Mükellef</h3>
          <p className="m-hint" style={{ margin: '0 0 .875rem' }}>
            Evraklar, Şirket Evraklarım ve tarama işlemleri seçili mükellef adına yapılır.
          </p>
          <button type="button" className="m-btn secondary" onClick={() => setPicking(true)}>
            <BuildingIcon width={18} height={18} /> Mükellef Değiştir
          </button>
        </div>
      )}

      <div className="m-card">
        <h3>Görünüm</h3>
        <div className="m-chips" style={{ marginBottom: 0 }} role="radiogroup" aria-label="Tema">
          {([['system', 'Sistem', <SettingsIcon key="s" width={15} height={15} />],
             ['light', 'Açık', <SunIcon key="l" width={15} height={15} />],
             ['dark', 'Koyu', <MoonIcon key="d" width={15} height={15} />]] as const).map(([value, label, icon]) => (
            <button key={value} type="button" role="radio" aria-checked={choice === value}
              className={`m-chip ${choice === value ? 'active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '.375rem' }}
              onClick={() => setChoice(value)}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      <InstallHint />

      <div className="m-card">
        <div className="m-rows">
          <div className="m-row static">
            <span className="label">Hesap türü</span>
            <span className="value">{ROLE_LABEL[role]}</span>
          </div>
          <div className="m-row static">
            <span className="label">Sürüm</span>
            <span className="value">{__APP_VERSION__}</span>
          </div>
        </div>
      </div>

      <p className="m-hint" style={{ textAlign: 'center', margin: '1rem 0' }}>
        Profil bilgileri, yetkilendirmeler ve kota yükseltmeleri{' '}
        <strong>{SITE_HOST}</strong> web panelinden yönetilir.
      </p>

      <button type="button" className="m-btn secondary" onClick={() => setConfirmLogout(true)}>
        <LogoutIcon width={18} height={18} /> Çıkış Yap
      </button>

      {picking && <TaxpayerPicker onClose={() => setPicking(false)} />}
      {confirmLogout && (
        <ConfirmSheet title="Çıkış yapılsın mı?" confirmLabel="Çıkış Yap" danger
          onConfirm={logout} onClose={() => setConfirmLogout(false)} />
      )}
    </MobilePage>
  );
}
