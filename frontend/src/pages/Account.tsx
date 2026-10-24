import { useEffect, useRef, useState } from 'react';
import { api, apiError, apiGet, apiPatch } from '../api/client';
import { useAuth } from '../auth';
import { OwnProfile, Role } from '../types';
import { RichTextEditor } from '../components/RichTextEditor';
import { CameraIcon } from '../components/Icons';
import { formatDate } from '../utils/date';
import { SITE_HOST } from '../site';

const ROLE_LABEL: Record<Role, string> = { taxpayer: 'Mükellef', accountant: 'Mali Müşavir', admin: 'Admin' };

function initialsFor(fullName?: string): string {
  const parts = (fullName ?? '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function memberSince(iso: string): string {
  return formatDate(iso);
}

export function Account() {
  const { refreshProfile } = useAuth();
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [accountantCanViewQuota, setAccountantCanViewQuota] = useState(true);
  const [accountantCanViewAiCredits, setAccountantCanViewAiCredits] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<OwnProfile>('/users/me').then((p) => {
      setProfile(p);
      setFullName(p.fullName);
      setUsername(p.username ?? '');
      setBio(p.bio ?? '');
      setIsPublic(p.isPublic);
      if (p.accountantCanViewQuota !== undefined) setAccountantCanViewQuota(p.accountantCanViewQuota);
      if (p.accountantCanViewAiCredits !== undefined) setAccountantCanViewAiCredits(p.accountantCanViewAiCredits);
    }).catch((e) => setError(apiError(e)));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMsg(''); setSaving(true);
    try {
      const updated = await apiPatch<OwnProfile>('/users/me', {
        fullName, username, bio, isPublic,
        ...(profile?.role === 'taxpayer' ? { accountantCanViewQuota, accountantCanViewAiCredits } : {}),
      });
      setProfile(updated);
      setMsg('Profil kaydedildi.');
      await refreshProfile();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function pickAvatar(file: File) {
    setError(''); setMsg(''); setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/users/me/avatar', fd);
      const updated: OwnProfile = res.data.data;
      setProfile(updated);
      await refreshProfile();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (!profile) {
    return error ? <div className="alert error">{error}</div> : <p className="muted">Yükleniyor…</p>;
  }

  const publicUrl = profile.username ? `${window.location.origin}/u/${profile.username}` : null;

  return (
    <div className="account-card">
      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert success">{msg}</div>}

      <div className="account-cover">
        <div className="account-avatar-row">
          <button type="button" className="account-avatar" onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar} title="Profil fotoğrafını değiştir">
            {profile.avatarUrl ? <img src={profile.avatarUrl} alt={fullName} /> : <span>{initialsFor(fullName)}</span>}
            <span className="account-avatar-overlay"><CameraIcon /></span>
          </button>
          <div className="account-identity">
            <span className="account-name">{profile.fullName}</span>
            <span className="account-meta-row">
              <span className="badge active">{ROLE_LABEL[profile.role]}</span>
              {profile.username && <span className="muted">@{profile.username}</span>}
              <span className="muted">· {memberSince(profile.createdAt)} tarihinden beri üye</span>
            </span>
          </div>
          <div className="account-avatar-actions">
            <button type="button" className="btn secondary sm" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
              {uploadingAvatar ? 'Yükleniyor…' : 'Fotoğraf Seç'}
            </button>
            <p className="hint">JPG, PNG veya WEBP — max 5MB.</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAvatar(f); }} />
        </div>
      </div>

      <form className="account-body" onSubmit={save}>
        <section className="account-section">
          <h3 className="account-section-title">Genel Bilgiler</h3>
          <div className="row">
            <div className="field">
              <label>Ad Soyad</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} maxLength={150} />
            </div>
            <div className="field">
              <label>E-posta</label>
              <input value={profile.email} disabled />
            </div>
          </div>

          <div className="field">
            <label>Kullanıcı Adı</label>
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())}
              pattern="[a-z0-9_]{3,30}" title="3-30 karakter; küçük harf, rakam ve alt çizgi" placeholder="kullaniciadi" />
            <span className="hint">Herkese açık profil adresiniz: {SITE_HOST}/u/{username || '…'}</span>
          </div>
        </section>

        <section className="account-section">
          <h3 className="account-section-title">Biyografi</h3>
          <div className="field">
            <RichTextEditor value={bio} onChange={setBio} />
          </div>
        </section>

        <section className="account-section">
          <h3 className="account-section-title">Görünürlük</h3>
          <div className="field">
            <label className="checkbox-field">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
              Profilimi herkese açık yap
            </label>
            <span className="hint">
              {isPublic && publicUrl
                ? <>Profiliniz şu adresten görüntülenebilir: <a href={`/u/${profile.username}`} target="_blank" rel="noreferrer">{publicUrl}</a></>
                : 'Kapalıyken profiliniz yalnızca sizin tarafınızdan görülür.'}
            </span>
          </div>
        </section>

        {profile.role === 'taxpayer' && (
          <section className="account-section">
            <h3 className="account-section-title">Mali Müşavir Erişimi</h3>
            <div className="field">
              <label className="checkbox-field">
                <input type="checkbox" checked={accountantCanViewQuota}
                  onChange={(e) => setAccountantCanViewQuota(e.target.checked)} />
                Mali Müşavirim kota ve kota geçmişimi görebilir
              </label>
            </div>
            <div className="field">
              <label className="checkbox-field">
                <input type="checkbox" checked={accountantCanViewAiCredits}
                  onChange={(e) => setAccountantCanViewAiCredits(e.target.checked)} />
                Mali Müşavirim AI kredi ve AI kredi geçmişimi görebilir
              </label>
              <span className="hint">Kapatırsanız mali müşaviriniz bu bilgileri Mükelleflerim sayfasında göremez.</span>
            </div>
          </section>
        )}

        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </div>
  );
}
