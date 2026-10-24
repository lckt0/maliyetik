import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, apiGet, appStorage, tabStorage, tokenStore } from './api/client';
import { resetTabs } from './tabs';
import { AuthUser, OwnProfile, Role } from './types';

interface AuthState {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  /** E-posta doğrulama linkindeki token'ı tüketir. Onay gerekmiyorsa hesabı aktive edip oturum açar. */
  verifyEmail: (token: string) => Promise<{ activated: boolean; role?: Role }>;
  logout: () => void;
  /** Aktif mükellef bağlamı: taxpayer için kendi id'si, müşavir için seçtiği. */
  activeTaxpayerId: string | null;
  setActiveTaxpayerId: (id: string | null) => void;
  /** Sidebar profil kartı + Hesap sayfası ortak kaynağı — avatar/bio/kullanıcı adı. */
  profile: OwnProfile | null;
  refreshProfile: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>(null as unknown as AuthState);

interface TaxpayerScope {
  activeTaxpayerId: string | null;
  setActiveTaxpayerId: (id: string | null) => void;
}

const TaxpayerScopeCtx = createContext<TaxpayerScope | null>(null);

/**
 * Bir sekmenin mükellef bağlamı. Uygulama penceresinde her sekme kendi mükellefiyle
 * çalışır (bkz. tabs.tsx); bu sağlayıcı o sekmenin bağlamını ağacın geri kalanına
 * verir ve `useAuth()` üzerinden okunur.
 */
export function TaxpayerScopeProvider({ taxpayerId, onChange, children }: {
  taxpayerId: string | null;
  onChange: (id: string | null) => void;
  children: ReactNode;
}) {
  const value = useMemo<TaxpayerScope>(
    () => ({ activeTaxpayerId: taxpayerId, setActiveTaxpayerId: onChange }),
    [taxpayerId, onChange],
  );
  return <TaxpayerScopeCtx.Provider value={value}>{children}</TaxpayerScopeCtx.Provider>;
}

/**
 * Oturum + İÇİNDE BULUNULAN SEKMENİN mükellef bağlamı.
 *
 * `activeTaxpayerId` varsa en yakın sekme kapsamından okunur. Sekme kapsamı yoksa
 * (giriş/kayıt sayfaları, mobil PWA) AuthProvider'ın kendi bağlamı geçerlidir. Çağıran
 * bileşenlerin bu ayrımı bilmesi gerekmez — `useAuth().activeTaxpayerId` her iki dünyada
 * da "şu an hangi mükellefe bakıyorum" sorusunun doğru cevabıdır.
 */
export function useAuth(): AuthState {
  const base = useContext(AuthCtx);
  const scope = useContext(TaxpayerScopeCtx);
  return useMemo(() => (scope ? { ...base, ...scope } : base), [base, scope]);
}

// Oturum verileri `appStorage` üzerinden okunur/yazılır: mobil PWA aynı origin'de çalıştığı
// için kendi anahtar önekiyle izole edilir (bkz. configureClient).
function loadUser(): AuthUser | null {
  const raw = appStorage.get('user');
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

/**
 * Sekme sistemi DIŞINDAKİ bağlam (giriş sayfası, mobil PWA, doğrudan açılan adres).
 *
 * Uygulama penceresinde bu değer kullanılmaz: orada mükellef bağlamı sekmenin kendisine
 * aittir ve `TaxpayerScopeProvider` üzerinden gelir (bkz. tabs.tsx). Burası yalnızca
 * pencere/sekme kurulmadan önceki ilk değeri üretir.
 *
 * Öncelik sırası:
 *   1. Adres çubuğundaki `?mukellef=` — paylaşılan/yer imlenmiş adres doğru mükellefle açılsın.
 *   2. Sekmenin kendi hafızası (sessionStorage) — yenilemede korunur.
 *   3. Son kullanılan mükellef (localStorage) — YALNIZCA müşavir DIŞINDAKİ roller için.
 *   4. Kullanıcı mükellefse kendi profili.
 *
 * MÜŞAVİRDE "son kullanılan" YEDEĞİ YOK. O yedek,
 * müşavirin ana penceresini de sessizce bir mükellefe bağlıyordu: ofis panosuna
 * bakarken açılan herhangi bir sayfa, aylar önce seçilmiş bir mükellefin verisini
 * gösterebiliyordu. Kural değişmedi, yalnızca birimi değişti — MÜKELLEFİ OLMAYAN SEKME
 * OFİS SEKMESİDİR; mükellefle çalışmak için o mükellef ayrı bir sekmede açılır.
 */
function initialTaxpayerId(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('mukellef');
    if (fromUrl) {
      tabStorage.set('activeTaxpayerId', fromUrl);
      return fromUrl;
    }
  } catch { /* adres okunamadı — aşağıdaki kaynaklara düş */ }

  const fromTab = tabStorage.get('activeTaxpayerId');
  if (fromTab) return fromTab;
  // Müşavirin ofis penceresi bilerek boş kalır (yukarıdaki not).
  if (loadUser()?.role === 'accountant') return null;
  return appStorage.get('activeTaxpayerId') || loadUser()?.taxpayerId || null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [activeTaxpayerId, setActive] = useState<string | null>(initialTaxpayerId);

  async function refreshProfile() {
    if (!user) { setProfile(null); return; }
    try { setProfile(await apiGet<OwnProfile>('/users/me')); } catch { /* sidebar sessizce eski hali gösterir */ }
  }

  useEffect(() => {
    refreshProfile();
    // eslint-disable-next-line
  }, [user?.userId]);

  const value = useMemo<AuthState>(() => ({
    user,
    profile,
    refreshProfile,
    activeTaxpayerId,
    setActiveTaxpayerId: (id) => {
      // Sekmenin kendi bağlamı + "son kullanılan" ipucu (yeni sekmeler bununla açılır).
      if (id) { tabStorage.set('activeTaxpayerId', id); appStorage.set('activeTaxpayerId', id); }
      else { tabStorage.remove('activeTaxpayerId'); appStorage.remove('activeTaxpayerId'); }
      setActive(id);
    },
    async login(email, password) {
      const res = await api.post('/auth/login', { email, password });
      const { accessToken, refreshToken, user: u } = res.data.data;
      tokenStore.set(accessToken, refreshToken);
      appStorage.set('user', JSON.stringify(u));
      setUser(u);
      if (u.taxpayerId) tabStorage.set('activeTaxpayerId', u.taxpayerId);
      else tabStorage.remove('activeTaxpayerId');
      setActive(u.taxpayerId ?? null);
      return u as AuthUser;
    },
    async verifyEmail(token) {
      const res = await api.post('/auth/verify-email', { token });
      const data = res.data.data as { activated: boolean; accessToken?: string; refreshToken?: string; user?: AuthUser };
      if (data.activated && data.accessToken && data.refreshToken && data.user) {
        tokenStore.set(data.accessToken, data.refreshToken);
        appStorage.set('user', JSON.stringify(data.user));
        setUser(data.user);
        setActive(data.user.taxpayerId ?? null);
      }
      return { activated: data.activated, role: data.user?.role };
    },
    logout() {
      tokenStore.clear();
      tabStorage.remove('activeTaxpayerId');
      // Sekmeler bu kullanıcıya aitti; sonraki kullanıcıya devredilmemeli.
      resetTabs();
      setUser(null);
      setActive(null);
      setProfile(null);
    },
  }), [user, profile, activeTaxpayerId]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function homePathFor(role: Role): string {
  return role === 'admin' ? '/admin' : role === 'accountant' ? '/musavir' : '/mukellef';
}

/**
 * Giriş/yönlendirme sonrası açılacak sayfa — kullanıcı Ayarlar > Panel'den "Evraklar"
 * ya da "Evrak Yükle" seçtiyse doğrudan oraya gider. Admin panelinde bu sayfalar
 * bulunmadığı için admin her zaman anasayfaya düşer.
 */
export function panelPathFor(role: Role, landing: 'home' | 'documents' | 'upload' = 'home'): string {
  const base = homePathFor(role);
  if (role === 'admin' || landing === 'home') return base;
  return landing === 'documents' ? `${base}/evraklar` : `${base}/yukle`;
}
