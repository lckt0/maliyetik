import { tokenStore } from '../api/client';
import { AuthUser } from '../types';

const STASH_KEY = 'impersonation_admin';

interface Stash {
  accessToken: string;
  refreshToken: string;
  user: string;
}

export function stashAdminSessionAndSwitchTo(tokens: { accessToken: string; refreshToken: string }, targetUser: AuthUser) {
  const stash: Stash = {
    accessToken: tokenStore.access ?? '',
    refreshToken: tokenStore.refresh ?? '',
    user: localStorage.getItem('user') ?? '',
  };
  sessionStorage.setItem(STASH_KEY, JSON.stringify(stash));

  tokenStore.set(tokens.accessToken, tokens.refreshToken);
  localStorage.setItem('user', JSON.stringify(targetUser));
  if (targetUser.taxpayerId) localStorage.setItem('activeTaxpayerId', targetUser.taxpayerId);
  else localStorage.removeItem('activeTaxpayerId');

  const home = targetUser.role === 'admin' ? '/admin' : targetUser.role === 'accountant' ? '/musavir' : '/mukellef';
  window.location.href = home;
}

function readStash(): Stash | null {
  const raw = sessionStorage.getItem(STASH_KEY);
  return raw ? (JSON.parse(raw) as Stash) : null;
}

/** Admin, bir kullanıcının hesabına geçtiğinde (impersonation) tüm sayfalarda görünen geri dönüş şeridi. */
export function ImpersonationBanner() {
  const stash = readStash();
  if (!stash) return null;

  const currentUserRaw = localStorage.getItem('user');
  const currentUser = currentUserRaw ? (JSON.parse(currentUserRaw) as AuthUser) : null;

  function restore() {
    if (!stash) return;
    tokenStore.set(stash.accessToken, stash.refreshToken);
    if (stash.user) localStorage.setItem('user', stash.user);
    localStorage.removeItem('activeTaxpayerId');
    sessionStorage.removeItem(STASH_KEY);
    window.location.href = '/admin/kullanicilar';
  }

  return (
    <div className="impersonation-banner">
      <span>
        <b>{currentUser?.fullName || currentUser?.email}</b> hesabı görüntüleniyor.
      </span>
      <button type="button" className="impersonation-restore" onClick={restore}>Yönetici oturumuna dön</button>
    </div>
  );
}
