import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from './api/client';
import { useIsTabActive } from './tabs';
import { AutoDigitizeStatus, DocumentType, MaliHafizaJobState } from './types';
import { SITE_URL } from './site';

export function useDocumentTypes() {
  const [types, setTypes] = useState<DocumentType[]>([]);
  useEffect(() => {
    apiGet<DocumentType[]>('/document-types').then(setTypes).catch(() => setTypes([]));
  }, []);
  return types;
}

/**
 * Çoklu seçim (checkbox) durumu — Evraklar tablosu ve Dijitalleştirme kuyruğu gibi
 * toplu işlem yapılan listelerde ortak kullanılır. "Tümünü seç" davranışı listeden
 * listeye değiştiği için iki ayrı yardımcı sunar: `replaceAll` kapsam dışındaki
 * seçimleri temizler, `toggleWithin` yalnızca verilen id'lere dokunup gerisini korur.
 */
export function useIdSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  /** Hepsi seçiliyse seçimi tamamen boşaltır, değilse yalnızca bu id'leri seçili bırakır. */
  const replaceAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, []);

  /** Verilen id'leri topluca ekler/çıkarır; listede görünmeyen seçimlere dokunmaz. */
  const toggleWithin = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }, []);

  return { selected, toggle, remove, clear, replaceAll, toggleWithin };
}

/**
 * Bir değerin son `delayMs` içinde değişmemiş halini döner — arama kutusu gibi her
 * tuş vuruşunda ağ isteği atmak istemediğimiz durumlarda kullanılır.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Z-Raporu dijitalleştirmede "Fiş Grubu" alanı için mevcut grup no'ları — evrak türü
 * z_raporu olduğunda hem manuel hem AI dijitalleştirme formunda kullanıcı elle yazmak
 * yerine daha önce kullanılmış bir gruptan seçebilsin diye.
 */
export function useReceiptGroups(documentTypeId: number | undefined, taxpayerId: string | null): string[] {
  const [groups, setGroups] = useState<string[]>([]);
  useEffect(() => {
    if (!documentTypeId) { setGroups([]); return; }
    const params: Record<string, string | number> = { documentTypeId };
    if (taxpayerId) params.taxpayerId = taxpayerId;
    apiGet<string[]>('/documents/receipt-groups', params).then(setGroups).catch(() => setGroups([]));
  }, [documentTypeId, taxpayerId]);
  return groups;
}

const AUTO_DIGITIZE_RUNNING_POLL_MS = 2500;
const AUTO_DIGITIZE_IDLE_POLL_MS = 15_000;

/**
 * "Otomatik Modu Başlat" ilerleme durumu — sayfa/zil ikonu ortak kullanır. Aktif iş varken
 * hızlı (2.5sn), yokken yavaş (15sn) polling yapar — böylece başka bir sekme/oturumdan
 * başlatılmış bir iş de yakalanır ("kullanıcı çıkış yapsa da arka planda devam eder").
 *
 * Polling yalnızca GÖRÜNEN sekmede döner: uygulama sekmeleri arka planda da mount kalıyor
 * (bkz. tabs.tsx), on iki sekme aynı anda poll etseydi açık sekme sayısı doğrudan sunucu
 * yüküne dönüşürdü. İş backend'de sürdüğü için sekmeye dönünce durum hemen tazelenir.
 */
export function useAutoDigitizeStatus(taxpayerId: string | null) {
  const [status, setStatus] = useState<AutoDigitizeStatus | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabActive = useIsTabActive();

  const poll = useCallback(() => {
    if (!taxpayerId) return;
    apiGet<AutoDigitizeStatus>('/ai-digitize/auto/status', { taxpayerId })
      .then((res) => {
        setStatus(res);
        const delay = res.status === 'running' ? AUTO_DIGITIZE_RUNNING_POLL_MS : AUTO_DIGITIZE_IDLE_POLL_MS;
        timerRef.current = setTimeout(poll, delay);
      })
      .catch(() => {
        timerRef.current = setTimeout(poll, AUTO_DIGITIZE_IDLE_POLL_MS);
      });
  }, [taxpayerId]);

  useEffect(() => {
    if (!taxpayerId) { setStatus(null); return; }
    if (!tabActive) return;
    poll();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [taxpayerId, poll, tabActive]);

  const start = useCallback(async (documentIds?: string[]) => {
    if (!taxpayerId) return;
    const res = await apiPost<AutoDigitizeStatus>('/ai-digitize/auto/start', { taxpayerId, documentIds });
    setStatus(res);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(poll, AUTO_DIGITIZE_RUNNING_POLL_MS);
  }, [taxpayerId, poll]);

  const cancel = useCallback(async () => {
    if (!taxpayerId) return;
    const res = await apiPost<AutoDigitizeStatus>('/ai-digitize/auto/cancel', { taxpayerId });
    setStatus(res);
  }, [taxpayerId]);

  return { status, start, cancel };
}

const MALI_HAFIZA_RUNNING_POLL_MS = 3000;
const MALI_HAFIZA_IDLE_POLL_MS = 15_000;

type MaliHafizaStatus = MaliHafizaJobState | { status: 'idle' };

/**
 * Mali Hafıza Raporu analiz/kayıt işinin durumu — "Evrak Kayıt" sayfası VE bildirim zili
 * ortak kullanır (bkz. `useAutoDigitizeStatus`, birebir aynı desen). İş sürerken hızlı,
 * durgunken yavaş poll yapar — kullanıcı başka bir sayfaya geçse/sekmeyi kapatsa bile iş
 * arka planda (backend'de) devam eder, dönünce kaldığı yerden devam eder.
 */
export function useMaliHafizaJobStatus(taxpayerId: string | null) {
  const [status, setStatus] = useState<MaliHafizaStatus | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Arka plandaki sekmede poll etmez (bkz. useAutoDigitizeStatus'taki not).
  const tabActive = useIsTabActive();

  const poll = useCallback(() => {
    if (!taxpayerId) return;
    apiGet<MaliHafizaStatus>('/documents/mali-hafiza/jobs/status', { taxpayerId })
      .then((res) => {
        setStatus(res);
        const running = res.status === 'analyzing' || res.status === 'saving';
        timerRef.current = setTimeout(poll, running ? MALI_HAFIZA_RUNNING_POLL_MS : MALI_HAFIZA_IDLE_POLL_MS);
      })
      .catch(() => {
        timerRef.current = setTimeout(poll, MALI_HAFIZA_IDLE_POLL_MS);
      });
  }, [taxpayerId]);

  useEffect(() => {
    if (!taxpayerId) { setStatus(null); return; }
    if (!tabActive) return;
    poll();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [taxpayerId, poll, tabActive]);

  const refresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    poll();
  }, [poll]);

  return { status, refresh };
}

const APP_NAME = 'Maliyetik';

/**
 * Pencere/sekme başlığını bulunulan sayfaya göre günceller.
 *
 * Müşavir aynı anda birden fazla mükellefle çalışıyor (bkz. tabs.tsx) ve hepsinin
 * başlığı aynı olduğunda hangi sekmenin hangi mükellef olduğu ancak sekmeye geçilerek
 * anlaşılıyordu. MÜKELLEF ADI ÖNE YAZILIR: dar bir sekmede yalnızca başlangıç görünür,
 * ayırt edici olan da odur — "Evraklar · …" ile başlayan üç sekme birbirinden ayrılmaz.
 *
 * Başlığı yalnızca GÖRÜNEN sekme yazar: arka plandaki sekmeler de mount halinde kaldığı
 * için her biri kendi başlığını yazsaydı pencere başlığı rastgele bir sekmeninki olurdu.
 *
 * Boş/null parçalar atılır, yani "sayfa yükleniyor, mükellef adı henüz gelmedi"
 * durumunda başlık kısa hâliyle doğru kalır.
 */
export function useDocumentTitle(...parts: Array<string | null | undefined>): void {
  const title = [...parts.filter((p): p is string => !!p && !!p.trim()), APP_NAME].join(' · ');
  const tabActive = useIsTabActive();
  useEffect(() => {
    if (tabActive) document.title = title;
  }, [title, tabActive]);
}

interface SeoMetaOptions {
  title: string;
  description: string;
  /** "/araclar/kdv-hesaplama" gibi kanonik yol. */
  path: string;
}

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/**
 * İstemci tarafında render edilen (SSR olmayan) araç sayfaları için başlık/meta/canonical
 * güncellemesi. Uygulama tek bir index.html'den servis edildiğinden, her aracın kendi SEO
 * bilgisini taşıması için sayfa mount olduğunda document head burada güncellenir.
 */
export function useSeoMeta({ title, description, path }: SeoMetaOptions): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', title, 'property');
    setMeta('og:description', description, 'property');
    setMeta('og:url', `${SITE_URL}${path}`, 'property');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousCanonical = canonical?.getAttribute('href') ?? null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', `${SITE_URL}${path}`);

    return () => {
      document.title = previousTitle;
      if (canonical && previousCanonical) canonical.setAttribute('href', previousCanonical);
    };
  }, [title, description, path]);
}
