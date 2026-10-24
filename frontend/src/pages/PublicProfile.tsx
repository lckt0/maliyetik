import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiGet } from '../api/client';
import { PublicProfile as PublicProfileType, Role } from '../types';
import { useDocumentTitle } from '../hooks';

const ROLE_LABEL: Record<Role, string> = { taxpayer: 'Mükellef', accountant: 'Mali Müşavir', admin: 'Admin' };

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

/**
 * Girişsiz herkese açık profil sayfası (/u/:username).
 * `profile.bio`, sunucuda kayıt anında allowlist ile sanitize edilir — burada
 * doğrudan render edilmesi güvenlidir (bkz. backend `sanitizeBio`).
 */
export function PublicProfile() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<PublicProfileType | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setNotFound(false);
    apiGet<PublicProfileType>(`/public/users/${username}`)
      .then(setProfile)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [username]);

  // Profil yüklenene kadar kullanıcı adı yeterli bir başlık; geldiğinde görünen ada geçer.
  useDocumentTitle(profile?.fullName ?? (username ? `@${username}` : null));

  return (
    <div className="login-wrap">
      <div className="card login-card public-profile-card">
        <div className="public-profile-cover">
          <Link to="/" className="public-profile-brand">Maliyetik</Link>
        </div>
        <div className="public-profile-body">
          {loading && <p className="muted" style={{ textAlign: 'center' }}>Yükleniyor…</p>}
          {!loading && notFound && (
            <div className="alert error">Bu profil bulunamadı ya da herkese açık değil.</div>
          )}
          {!loading && profile && (
            <>
              <div className="public-profile-avatar">
                {profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.fullName} /> : <span>{initialsFor(profile.fullName)}</span>}
              </div>
              <h2 className="public-profile-name">{profile.fullName}</h2>
              <div className="public-profile-meta">
                <span className="badge active">{ROLE_LABEL[profile.role]}</span>
                <span className="public-profile-username">@{profile.username}</span>
              </div>
              {profile.bio && <div className="rich-text public-profile-bio" dangerouslySetInnerHTML={{ __html: profile.bio }} />}
            </>
          )}
        </div>
      </div>
      <div className="auth-footer-link">
        <Link to="/">← Maliyetik anasayfasına dön</Link>
      </div>
    </div>
  );
}
