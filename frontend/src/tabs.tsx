import { createContext, ReactNode, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { appStorage, tabStorage } from './api/client';
import { pageIdentityFor } from './nav';
import { Role } from './types';

/**
 * UYGULAMA SEKMELERİ.
 *
 * Uygulama kendi penceresinde çalışır ve o pencerenin kendi sekme şeridi vardır
 *. Önceki model her mükellefi ayrı bir TARAYICI
 * penceresinde açıyordu (`openTaxpayerWindow`); görev çubuğu beş "Maliyetik" ile
 * doluyor, pencereler arası geçiş işletim sistemine kalıyordu. Artık aynı işi tek
 * pencerede sekmeler yapıyor:
 *
 *   - Bir sekme = bir SAYFA + bir MÜKELLEF. Mükellefi olmayan sekme ofis sekmesidir
 *     (bkz. components/TaxpayerScoped.tsx) — "mükellefi olmayan pencere ofis
 *     penceresidir" kuralı olduğu gibi sekmeye taşındı.
 *   - Her sekmenin kendi adres geçmişi (MemoryRouter) ve kendi mükellef bağlamı var;
 *     bir sekmede mükellef değiştirmek diğerlerini ETKİLEMEZ. Yanlış mükellefe evrak
 *     yüklemenin önündeki asıl koruma buydu, sekme modelinde de aynen duruyor.
 *   - Sekme bir kez açıldıktan sonra kapanana kadar MOUNT halinde kalır: filtreler,
 *     arama kutusu, scroll ve yarım doldurulmuş formlar geri dönünce yerinde durur.
 *
 * Depo bilerek React dışında (modül düzeyinde, `useSyncExternalStore` ile okunan)
 * tutuluyor — `dataBus.ts` ve `uploadManager.ts` ile aynı desen. Böylece mükellef
 * panosu, mükellef listesi ve mükellef seçici hook zincirine girmeden sekme açabiliyor.
 */

export interface AppTab {
  id: string;
  /** Sekmenin adresi (arama parametreleri dahil). Sekme içindeki router bildirir. */
  path: string;
  /** Sekmenin mükellefi. null = ofis sekmesi. */
  taxpayerId: string | null;
  /** Şeritte yazan mükellef adı — liste yüklenmeden de doğru görünsün diye saklanır. */
  taxpayerTitle: string | null;
  /** Şeritte yazan sayfa adı. Sekme mount olduğunda Layout günceller. */
  title: string;
  /**
   * Sekme İLK KEZ etkinleştirilene kadar mount EDİLMEZ.
   *
   * Oturum geri yüklendiğinde on iki sekmenin birden veri çekmesini engeller; asıl
   * maliyet açılışta bir kere ödenmesin diye. Bir kez yüklendikten sonra sekme
   * kapanana kadar canlı kalır.
   */
  loaded: boolean;
}

interface TabsState {
  /** Sekmeler kime ait — başka bir kullanıcı giriş yaptığında geri yüklenmemeli. */
  userId: string | null;
  role: Role | null;
  tabs: AppTab[];
  activeId: string;
  /** Yeni sekmenin ve "son sekme kapandı" durumunun düşeceği adres. */
  home: { path: string; taxpayerId: string | null };
  /** Sekme sınırı gibi anlık uyarılar — şeridin altında birkaç saniye görünür. */
  notice: string | null;
}

/**
 * Sekme sınırı. Tarayıcıda olduğu gibi sınırsız değil: her sekme canlı kaldığı için
 * kendi bileşen ağacını, isteklerini ve belleğini taşıyor. On iki, "bir günde
 * dokunulan mükellef sayısı"nın rahatça üstünde ve tek şeride sığan bir sayı.
 */
export const MAX_TABS = 12;

/** Mükellef sekmesinin doğal başlangıcı — ofis seviyesindeki sayfalardan açılırken. */
export const TAXPAYER_TAB_HOME = '/musavir/evraklar';

const LIVE_KEY = 'tabs';        // sessionStorage: bu pencerenin canlı düzeni (yenilemede korunur)
const LAST_KEY = 'tabs:last';   // localStorage: son oturumun düzeni (pencere yeniden açılınca)
const NOTICE_MS = 4000;

interface PersistedTabs {
  v: 1;
  userId: string;
  activeId: string;
  tabs: Array<Omit<AppTab, 'loaded'>>;
}

let state: TabsState = {
  userId: null,
  role: null,
  tabs: [],
  activeId: '',
  home: { path: '/', taxpayerId: null },
  notice: null,
};

const listeners = new Set<() => void>();
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function persist(): void {
  if (!state.userId) return;
  const payload: PersistedTabs = {
    v: 1,
    userId: state.userId,
    activeId: state.activeId,
    tabs: state.tabs.map(({ loaded: _loaded, ...rest }) => rest),
  };
  const json = JSON.stringify(payload);
  tabStorage.set(LIVE_KEY, json);
  try { appStorage.set(LAST_KEY, json); } catch { /* özel mod — yalnızca yenileme korunur */ }
}

function read(key: string, fromTab: boolean, userId: string): PersistedTabs | null {
  try {
    const raw = fromTab ? tabStorage.get(key) : appStorage.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedTabs;
    // Başka bir kullanıcının sekmeleri asla geri yüklenmez.
    if (parsed?.v !== 1 || parsed.userId !== userId || !Array.isArray(parsed.tabs) || !parsed.tabs.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function commit(next: Partial<TabsState>): void {
  state = { ...state, ...next };
  persist();
  listeners.forEach((l) => l());
}

function notify(message: string): void {
  commit({ notice: message });
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => commit({ notice: null }), NOTICE_MS);
}

/** crypto.randomUUID güvenli olmayan bağlamda (http://ip) ve eski Safari'de yok. */
function newId(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  return c?.randomUUID?.() ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function titleFor(path: string, taxpayerId: string | null): string {
  if (!state.role) return 'Yeni sekme';
  return pageIdentityFor(state.role, !!taxpayerId, path).title;
}

function makeTab(path: string, taxpayerId: string | null, taxpayerTitle: string | null, loaded: boolean): AppTab {
  return { id: newId(), path, taxpayerId, taxpayerTitle, title: titleFor(path, taxpayerId), loaded };
}

// ---- Okuma ----

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function snapshot(): TabsState {
  return state;
}

export function useTabs(): TabsState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function getTabs(): TabsState {
  return state;
}

// ---- Açılış / kapanış ----

export interface TabsSeed {
  userId: string;
  role: Role;
  /** Yeni sekme düğmesinin ve boş kalan pencerenin düşeceği adres. */
  homePath: string;
  homeTaxpayerId: string | null;
  /** Pencere bu adresle açıldıysa ilk sekme oradan başlar (ör. kısayol, paylaşılan link). */
  urlPath?: string;
  urlTaxpayerId?: string | null;
}

/**
 * Adres çubuğundaki yol bir sekme açmaya değer mi? Anasayfa, giriş akışı ve uygulamanın
 * açılış adresi (`/uygulama`) sekme değil, yalnızca birer kapıdır.
 */
function usablePath(path?: string): boolean {
  if (!path || path === '/') return false;
  return !['/uygulama', '/login', '/kayit', '/dogrula', '/sifre-sifirla'].some((p) => path.startsWith(p));
}

/**
 * Sekmeleri kurar: önce bu pencerenin canlı düzeni (yenileme), sonra son oturumun
 * düzeni (pencere kapanıp açıldı), o da yoksa tek bir ev sekmesi.
 *
 * Aynı kullanıcı için ikinci kez çağrılması sonuçsuzdur — çağıran taraf (workspace)
 * her render'da güvenle çağırabilsin diye.
 */
export function bootTabs(seed: TabsSeed): void {
  if (state.userId === seed.userId && state.tabs.length) {
    if (state.role !== seed.role) commit({ role: seed.role });
    return;
  }

  state = {
    ...state,
    userId: seed.userId,
    role: seed.role,
    home: { path: seed.homePath, taxpayerId: seed.homeTaxpayerId },
  };

  const live = read(LIVE_KEY, true, seed.userId);
  const restored = live ?? read(LAST_KEY, false, seed.userId);
  if (restored) {
    const tabs = restored.tabs.map((t) => ({ ...t, taxpayerTitle: t.taxpayerTitle ?? null, loaded: false }));
    const activeId = tabs.some((t) => t.id === restored.activeId) ? restored.activeId : tabs[0].id;
    commit({ tabs: tabs.map((t) => (t.id === activeId ? { ...t, loaded: true } : t)), activeId });

    // Geçen OTURUMUN düzeni geri geldiyse adres çubuğundaki sayfa, kullanıcının şu an
    // açmak istediği sayfadır (yer imi, paylaşılan link): sekmelere eklenir ve öne alınır.
    // Canlı düzende (aynı pencerenin yenilenmesi) buna gerek yok — oradaki adresi zaten
    // biz yazdık (bkz. TabbedWorkspace TabRouteSync).
    if (!live && usablePath(seed.urlPath)) {
      openTab({ path: seed.urlPath!, taxpayerId: seed.urlTaxpayerId ?? null });
    }
    return;
  }

  // Adres çubuğunda gerçek bir panel sayfası varsa ilk sekme oradan başlasın; değilse ev.
  const first = usablePath(seed.urlPath)
    ? makeTab(seed.urlPath!, seed.urlTaxpayerId ?? null, null, true)
    : makeTab(seed.homePath, seed.homeTaxpayerId, null, true);
  commit({ tabs: [first], activeId: first.id });
}

/** Çıkışta: sekmeler bu kullanıcıya aitti, sonraki kullanıcıya devredilmez. */
export function resetTabs(): void {
  tabStorage.remove(LIVE_KEY);
  try { appStorage.remove(LAST_KEY); } catch { /* yoksay */ }
  state = { userId: null, role: null, tabs: [], activeId: '', home: state.home, notice: null };
  listeners.forEach((l) => l());
}

export interface OpenTabOptions {
  path: string;
  taxpayerId?: string | null;
  taxpayerTitle?: string | null;
  /** Sekmeyi açar ama öne almaz (orta tık / Ctrl+tık). */
  background?: boolean;
  /** Aynı sayfa zaten açık olsa bile İKİNCİ bir sekme aç. */
  force?: boolean;
}

/**
 * Sekme açar. Aynı mükellefin aynı sayfası zaten açıksa yenisini açmaz, o sekmeyi öne
 * alır — tarayıcıdaki gibi değil ama burada doğrusu bu: aynı mükellefin evrak listesini
 * iki sekmede tutmak karışıklıktan başka bir şey üretmiyor. Bilerek çoğaltmak isteyen
 * `force` kullanır (şerit menüsündeki "Sekmeyi çoğalt").
 */
export function openTab(opts: OpenTabOptions): string {
  const { path, taxpayerId = null, taxpayerTitle = null, background = false, force = false } = opts;

  if (!force) {
    const existing = state.tabs.find((t) => t.taxpayerId === taxpayerId && t.path === path);
    if (existing) {
      if (!background) activateTab(existing.id);
      return existing.id;
    }
  }

  if (state.tabs.length >= MAX_TABS) {
    notify(`En fazla ${MAX_TABS} sekme açık olabilir. Yeni bir sekme için birini kapatın.`);
    return '';
  }

  const tab = makeTab(path, taxpayerId, taxpayerTitle, !background);
  // Yeni sekme aktif sekmenin SAĞINA girer (tarayıcı davranışı): bir mükellefle ilgili
  // açılan sekmeler onu açan sekmenin yanında kalsın, şeridin sonuna savrulmasın.
  const at = state.tabs.findIndex((t) => t.id === state.activeId);
  const tabs = [...state.tabs];
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, tab);
  commit({ tabs, activeId: background ? state.activeId : tab.id });
  return tab.id;
}

/**
 * Bulunulan sayfa mükellef bazlı DEĞİLSE (pano, Mükelleflerim, Hesap & Kullanım…) o
 * adresi mükellefle açmak kullanıcıyı yine ofis sayfasına götürürdü; böyle durumlarda
 * Evraklar açılır.
 */
export function taxpayerTabPath(pathname: string): string {
  const officeLevel = !pathname.startsWith('/musavir/')
    || pathname === '/musavir/mukellefler'
    || pathname === '/musavir/ai-kredi';
  return officeLevel ? TAXPAYER_TAB_HOME : pathname;
}

/**
 * Bir mükellefi kendi sekmesinde açar. O mükellefin sekmesi zaten varsa yenisini
 * açmak yerine onu öne alır ve istenen sayfaya götürür — müşavir gün içinde aynı
 * mükellefe defalarca dönüyor; her dönüşte yeni sekme açılsaydı şerit dolardı.
 */
export function openTaxpayerTab(
  taxpayerId: string,
  path: string = TAXPAYER_TAB_HOME,
  opts: { taxpayerTitle?: string | null; force?: boolean; background?: boolean } = {},
): string {
  if (!opts.force) {
    const existing = state.tabs.find((t) => t.taxpayerId === taxpayerId);
    if (existing) {
      if (existing.path !== path) navigateTab(existing.id, path);
      if (!opts.background) activateTab(existing.id);
      return existing.id;
    }
  }
  return openTab({ path, taxpayerId, taxpayerTitle: opts.taxpayerTitle ?? null, force: opts.force, background: opts.background });
}

/** Ofis sekmesi (mükellefsiz) — varsa öne alır, yoksa açar. */
export function openOfficeTab(path = '/musavir'): string {
  const existing = state.tabs.find((t) => t.taxpayerId === null);
  if (existing) {
    if (existing.path !== path) navigateTab(existing.id, path);
    activateTab(existing.id);
    return existing.id;
  }
  return openTab({ path });
}

/** Şeritteki "+" — ev sekmesi açar (müşavirde ofis panosu, mükellefte anasayfa). */
export function openHomeTab(): string {
  return openTab({ path: state.home.path, taxpayerId: state.home.taxpayerId, force: true });
}

export function closeTab(id: string): void {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index < 0) return;
  const rest = state.tabs.filter((t) => t.id !== id);

  // Son sekme kapatıldığında pencereyi boş bırakmak yerine ev sekmesine dön: tarayıcı
  // burada pencereyi kapatırdı, ama bu pencere uygulamanın kendisi.
  if (!rest.length) {
    const home = makeTab(state.home.path, state.home.taxpayerId, null, true);
    commit({ tabs: [home], activeId: home.id });
    return;
  }

  if (state.activeId !== id) { commit({ tabs: rest }); return; }
  // Kapatılanın sağındaki sekme öne gelir, sağda yoksa soldaki.
  const next = rest[Math.min(index, rest.length - 1)];
  commit({ tabs: rest.map((t) => (t.id === next.id ? { ...t, loaded: true } : t)), activeId: next.id });
}

export function closeOtherTabs(id: string): void {
  const keep = state.tabs.find((t) => t.id === id);
  if (!keep) return;
  commit({ tabs: [{ ...keep, loaded: true }], activeId: id });
}

export function closeTabsToRight(id: string): void {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index < 0) return;
  const tabs = state.tabs.slice(0, index + 1);
  const activeId = tabs.some((t) => t.id === state.activeId) ? state.activeId : id;
  commit({ tabs: tabs.map((t) => (t.id === activeId ? { ...t, loaded: true } : t)), activeId });
}

export function duplicateTab(id: string): void {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return;
  openTab({ path: tab.path, taxpayerId: tab.taxpayerId, taxpayerTitle: tab.taxpayerTitle, force: true });
}

export function activateTab(id: string): void {
  if (state.activeId === id) return;
  if (!state.tabs.some((t) => t.id === id)) return;
  commit({ tabs: state.tabs.map((t) => (t.id === id ? { ...t, loaded: true } : t)), activeId: id });
}

/** Alt+1..9 — dokuzuncu tuş her zaman SON sekmeye gider (tarayıcı davranışı). */
export function activateByIndex(index: number): void {
  const target = index >= 8 ? state.tabs[state.tabs.length - 1] : state.tabs[index];
  if (target) activateTab(target.id);
}

/** Ctrl+Tab / Ctrl+Shift+Tab — uçlarda başa/sona sarar. */
export function activateRelative(delta: number): void {
  const at = state.tabs.findIndex((t) => t.id === state.activeId);
  if (at < 0 || state.tabs.length < 2) return;
  const next = (at + delta + state.tabs.length) % state.tabs.length;
  activateTab(state.tabs[next].id);
}

export function moveTab(id: string, toIndex: number): void {
  const from = state.tabs.findIndex((t) => t.id === id);
  if (from < 0 || from === toIndex) return;
  const tabs = [...state.tabs];
  const [moved] = tabs.splice(from, 1);
  tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, moved);
  commit({ tabs });
}

// ---- Sekme içeriğinden gelen güncellemeler ----

export function setTabPath(id: string, path: string): void {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab || tab.path === path) return;
  commit({ tabs: state.tabs.map((t) => (t.id === id ? { ...t, path, title: titleFor(path, t.taxpayerId) } : t)) });
}

export function setTabTitle(id: string, title: string, taxpayerTitle: string | null): void {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab || (tab.title === title && tab.taxpayerTitle === taxpayerTitle)) return;
  commit({ tabs: state.tabs.map((t) => (t.id === id ? { ...t, title, taxpayerTitle } : t)) });
}

/**
 * Sekmenin mükellefini değiştirir (üst bardaki mükellef seçici). Yalnızca BU sekmeyi
 * etkiler; diğer sekmelerin bağlamına dokunmaz.
 */
export function setTabTaxpayer(id: string, taxpayerId: string | null, taxpayerTitle: string | null = null): void {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab || tab.taxpayerId === taxpayerId) return;
  commit({
    tabs: state.tabs.map((t) => (t.id === id
      ? { ...t, taxpayerId, taxpayerTitle, title: titleFor(t.path, taxpayerId) }
      : t)),
  });
}

// ---- Sekme içindeki router'a erişim ----

/**
 * Mount olmuş her sekme kendi `navigate` fonksiyonunu buraya bırakır: şeritten ya da
 * başka bir sekmeden "şu sekmeyi şu sayfaya götür" denebilsin diye. Sekme henüz mount
 * edilmemişse (tembel yükleme) yalnızca adresi güncellenir — router zaten mount
 * olurken o adresten başlar.
 */
const navigators = new Map<string, (path: string) => void>();

export function registerTabNavigator(id: string, navigate: (path: string) => void): () => void {
  navigators.set(id, navigate);
  return () => { if (navigators.get(id) === navigate) navigators.delete(id); };
}

export function navigateTab(id: string, path: string): void {
  const navigate = navigators.get(id);
  if (navigate) navigate(path);
  else setTabPath(id, path);
}

// ---- Sekme bağlamı (React) ----

interface TabScopeValue { tabId: string; active: boolean; }

const TabScopeCtx = createContext<TabScopeValue | null>(null);

export function TabScopeProvider({ tabId, active, children }: { tabId: string; active: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ tabId, active }), [tabId, active]);
  return <TabScopeCtx.Provider value={value}>{children}</TabScopeCtx.Provider>;
}

export function useTabScope(): TabScopeValue | null {
  return useContext(TabScopeCtx);
}

/**
 * Bu bileşen görünen sekmede mi? Sekme sisteminin DIŞINDA (giriş sayfası, mobil PWA)
 * her zaman true döner — çağıran taraf iki dünyayı ayırt etmek zorunda kalmasın.
 *
 * Arka plandaki sekmeler canlı kaldığı için poll eden her şey (bildirim zili,
 * dijitalleştirme durumu) bununla susturulur: on iki sekme aynı anda 15 saniyede bir
 * istek atsaydı, açık sekme sayısı doğrudan sunucu yüküne dönüşürdü.
 */
export function useIsTabActive(): boolean {
  const scope = useTabScope();
  return scope === null || scope.active;
}

/** Sekmenin şeritte görünen adını bildirir (Layout çağırır). */
export function useTabTitle(title: string, taxpayerTitle: string | null): void {
  const scope = useTabScope();
  const tabId = scope?.tabId;
  useEffect(() => {
    if (tabId) setTabTitle(tabId, title, taxpayerTitle);
  }, [tabId, title, taxpayerTitle]);
}
