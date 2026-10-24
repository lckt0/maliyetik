import axios, { AxiosError, AxiosRequestConfig } from 'axios';

/** API base URL build-time'da Vite env'inden gelir (VITE_API_BASE_URL). */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
});

export interface ClientConfig {
  /**
   * `x-client-type` üstbilgisi. 'mobile' gönderildiğinde backend mobil erişim kurallarını
   * uygular (yalnızca mükellef — bkz. AuthService.assertMobileAccess). Masaüstü panel bunu
   * hiç göndermez ve hiçbir kısıta takılmaz.
   */
  clientType?: 'mobile';
  /**
   * localStorage anahtar öneki. Mobil PWA masaüstü panelle AYNI origin'de (/app/) çalıştığı
   * için depolama da paylaşılıyor; önek olmasa masaüstünde giriş yapmış bir müşavir /app/
   * açtığında hazır oturumu miras alır ve rol engeli delinirdi.
   */
  storagePrefix: string;
  /** Oturum düştüğünde gidilecek yol (masaüstü /login, mobil /app/giris). */
  loginPath: string;
}

let config: ClientConfig = { storagePrefix: '', loginPath: '/login' };

/** Giriş noktası (main.tsx) tarafından render'dan ÖNCE çağrılır. */
export function configureClient(next: ClientConfig): void {
  config = next;
  if (next.clientType) api.defaults.headers.common['x-client-type'] = next.clientType;
}

/** Önekli localStorage erişimi — tokenStore ve auth.tsx ortak kullanır. */
export const appStorage = {
  get: (key: string) => localStorage.getItem(config.storagePrefix + key),
  set: (key: string, value: string) => localStorage.setItem(config.storagePrefix + key, value),
  remove: (key: string) => localStorage.removeItem(config.storagePrefix + key),
};

/**
 * Sekmeye/pencereye özel depolama.
 *
 * Mali müşavir aynı anda birden çok mükellefle çalışabilsin diye seçili mükellef
 * localStorage'da (tüm sekmelerde ortak) değil, sessionStorage'da (sekme başına ayrı)
 * tutulur — bir pencerede mükellef değiştirmek diğer pencereleri etkilemez.
 * Oturum bilgisi (token) ortak kalır; yalnızca çalışma bağlamı ayrışır.
 *
 * Özel sekme/gizli mod gibi sessionStorage'a erişimin engellendiği durumlarda sessizce
 * bellek içi bir haritaya düşer — uygulama çalışmaya devam eder, yalnızca yenilemede
 * bağlam kaybolur.
 */
const memoryFallback = new Map<string, string>();
export const tabStorage = {
  get(key: string): string | null {
    try { return sessionStorage.getItem(config.storagePrefix + key); }
    catch { return memoryFallback.get(config.storagePrefix + key) ?? null; }
  },
  set(key: string, value: string): void {
    try { sessionStorage.setItem(config.storagePrefix + key, value); }
    catch { memoryFallback.set(config.storagePrefix + key, value); }
  },
  remove(key: string): void {
    try { sessionStorage.removeItem(config.storagePrefix + key); }
    catch { memoryFallback.delete(config.storagePrefix + key); }
  },
};

export const tokenStore = {
  get access() { return appStorage.get('accessToken'); },
  get refresh() { return appStorage.get('refreshToken'); },
  set(access: string, refresh: string) {
    appStorage.set('accessToken', access);
    appStorage.set('refreshToken', refresh);
  },
  clear() {
    appStorage.remove('accessToken');
    appStorage.remove('refreshToken');
    appStorage.remove('user');
    appStorage.remove('activeTaxpayerId');
    // Mobilde seçili mükellefin adı da saklanıyor (bkz. app/taxpayerContext.ts) —
    // çıkışta kalırsa sonraki kullanıcıya başkasının mükellefi görünürdü.
    appStorage.remove('activeTaxpayerTitle');
  },
};

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 401'de bir kez refresh dene; olmazsa login'e at.
let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ error?: { code?: string } }>) => {
    if (error.response?.status === 503 && error.response.data?.error?.code === 'MAINTENANCE') {
      window.dispatchEvent(new Event('maliyetik:maintenance'));
      return Promise.reject(error);
    }

    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const isAuthCall = original?.url?.includes('/auth/');
    if (error.response?.status === 401 && !original._retried && !isAuthCall && tokenStore.refresh) {
      original._retried = true;
      refreshing ??= doRefresh();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return api(original);
      }
      tokenStore.clear();
      window.location.href = config.loginPath;
    }
    return Promise.reject(error);
  },
);

async function doRefresh(): Promise<string | null> {
  try {
    // Çıplak `axios` kullanılıyor (interceptor döngüsüne girmemek için) — bu yüzden
    // `x-client-type` burada ELLE eklenmeli. Aksi halde mobil istemcinin refresh isteği
    // masaüstü gibi görünür ve backend'in rol engeli yalnızca ilk girişte çalışırdı.
    const res = await axios.post(
      `${api.defaults.baseURL}/auth/refresh`,
      { refreshToken: tokenStore.refresh },
      config.clientType ? { headers: { 'x-client-type': config.clientType } } : undefined,
    );
    const { accessToken, refreshToken } = res.data.data;
    tokenStore.set(accessToken, refreshToken);
    return accessToken;
  } catch {
    return null;
  }
}

/** {data:...} zarfını açan yardımcılar. */
export async function apiGet<T>(url: string, params?: object): Promise<T> {
  const res = await api.get(url, { params });
  return res.data.data as T;
}
export async function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.post(url, body, config);
  return res.data?.data as T;
}
export async function apiPatch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.patch(url, body, config);
  return res.data?.data as T;
}
export async function apiDelete<T>(url: string): Promise<T> {
  const res = await api.delete(url);
  return res.data?.data as T;
}

/**
 * Backend'in `error.code` alanı (ör. 'MAINTENANCE', 'MOBILE_ROLE_NOT_ALLOWED') — çağıranın
 * hatayı metne bakmadan ayırt etmesi için. Kodsuz hatalarda undefined döner.
 */
export function apiErrorCode(e: unknown): string | undefined {
  return (e as AxiosError<{ error?: { code?: string } }>).response?.data?.error?.code;
}

export function apiError(e: unknown): string {
  const err = e as AxiosError<{ error?: { message?: string }; message?: string }>;
  return (
    err.response?.data?.error?.message ||
    err.response?.data?.message ||
    err.message ||
    'Beklenmeyen bir hata oluştu.'
  );
}
