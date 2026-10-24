import { useEffect, useSyncExternalStore } from 'react';

/**
 * Uygulama genelinde "şu veri değişti" sinyali.
 *
 * Panelde her sayfa kendi verisini kendi `useEffect`'inde çekiyordu; bir yerde yapılan
 * değişiklik (evrak silme, yetki kabul etme, kota tahsisi…) başka bir sayfada/bileşende
 * ancak sayfa yenilenince görünüyordu. Mutasyon yapan yer `bumpData('documents')` çağırır,
 * o veriyi gösteren her bileşen `useDataVersion('documents')` ile yeniden çeker.
 *
 * Bilerek küçük tutuldu: tam bir sorgu önbelleği (react-query vb.) yerine yalnızca bir
 * sürüm sayacı — mevcut `useEffect` tabanlı çekim kodunun tamamı olduğu gibi kalıyor,
 * bağımlılık dizisine bir sayı ekleniyor.
 */
export type DataKey =
  | 'documents'        // evrak listeleri, gruplar, çöp kutusu, loglar
  | 'company-documents'
  | 'taxpayers'        // müşavirin mükellef listesi / yetkiler
  | 'quota'
  | 'ai-credits'
  | 'notifications'
  | 'notes';

const versions = new Map<DataKey, number>();
const listeners = new Map<DataKey, Set<() => void>>();

/** Aynı anda birden çok anahtar bump edildiğinde tek render'da toplanır. */
export function bumpData(...keys: DataKey[]): void {
  for (const key of keys) {
    versions.set(key, (versions.get(key) ?? 0) + 1);
    listeners.get(key)?.forEach((l) => l());
  }
}

function subscribe(key: DataKey, cb: () => void): () => void {
  let set = listeners.get(key);
  if (!set) { set = new Set(); listeners.set(key, set); }
  set.add(cb);
  return () => { set!.delete(cb); };
}

/**
 * Verilen anahtarın sürüm numarası — `useEffect` bağımlılık dizisine konur, `bumpData`
 * çağrıldığında effect yeniden çalışır.
 */
export function useDataVersion(key: DataKey): number {
  return useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => versions.get(key) ?? 0,
    () => 0,
  );
}

/**
 * Sekme yeniden odaklandığında verilen anahtarları tazeler — kullanıcı başka bir sekmede
 * (ya da mobil uygulamada) işlem yapıp geri döndüğünde panel bayat kalmasın diye.
 * Sık odak değişimlerinde gereksiz istek atmamak için asgari aralık uygulanır.
 */
export function useRefreshOnFocus(keys: DataKey[], minIntervalMs = 30_000): void {
  useEffect(() => {
    let last = Date.now();
    const onFocus = () => {
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - last < minIntervalMs) return;
      last = Date.now();
      bumpData(...keys);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
    // keys dizisi çağrı yerinde sabit literal olarak veriliyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minIntervalMs]);
}
