import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiGet } from './api/client';
import { useAuth } from './auth';
import { bumpData, useDataVersion } from './dataBus';
import { Authorization } from './types';

interface TaxpayersState {
  /** Müşavirin tüm yetkileri (aktif + bekleyen + iptal). */
  all: Authorization[];
  /** Yalnızca aktif yetkiler — mükellef seçicide ve kapsam kontrollerinde kullanılan liste. */
  active: Authorization[];
  /**
   * Seçili mükellefin yetki kaydı (varsa) — SEKME başına hesaplanır (bkz. useMyTaxpayers).
   * Sağlayıcı listeyi paylaşır, "hangisi seçili" sorusunun cevabı her sekmede farklıdır.
   */
  current: Authorization | null;
  loading: boolean;
  reload: () => void;
}

const Ctx = createContext<TaxpayersState>({ all: [], active: [], current: null, loading: false, reload: () => {} });

/**
 * Müşavirin mükellef listesi tek yerden.
 *
 * Önceden `/authorizations/my-taxpayers` en az beş ayrı bileşende (üst bar seçici,
 * müşavir anasayfası, Mükelleflerim, Luca içe aktarma, mükellef kotası) birbirinden
 * habersiz çekiliyordu; her biri `[]` bağımlılığıyla yalnızca bir kez. Sonuç: bir
 * mükellefi kabul edince üst bardaki seçicide görünmüyor, yetki iptal edilince listede
 * kalmaya devam ediyordu — kullanıcı sayfayı yenilemek zorundaydı.
 *
 * Artık tek istek paylaşılıyor ve `bumpData('taxpayers')` ile her yerden tazelenebiliyor.
 */
export function TaxpayersProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const version = useDataVersion('taxpayers');
  const [all, setAll] = useState<Authorization[]>([]);
  const [loading, setLoading] = useState(false);

  // Yalnızca müşavirin böyle bir listesi var; mükellef/admin boşuna istek atmasın.
  const enabled = user?.role === 'accountant';

  useEffect(() => {
    if (!enabled) { setAll([]); return; }
    let cancelled = false;
    setLoading(true);
    apiGet<Authorization[]>('/authorizations/my-taxpayers')
      .then((rows) => { if (!cancelled) setAll(rows); })
      .catch(() => { if (!cancelled) setAll([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, user?.userId, version]);

  const active = useMemo(() => all.filter((a) => a.status === 'active'), [all]);
  const reload = useCallback(() => bumpData('taxpayers'), []);

  // `current` burada HESAPLANMAZ: sağlayıcı sekmelerin üstünde duruyor, seçili mükellef
  // ise sekmenin kendisine ait. Liste tek istekle paylaşılır, seçim hook'ta çözülür.
  const value = useMemo<TaxpayersState>(
    () => ({ all, active, current: null, loading, reload }),
    [all, active, loading, reload],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMyTaxpayers(): TaxpayersState {
  const ctx = useContext(Ctx);
  // Aktif mükellef sekmeden gelir (bkz. auth.tsx useAuth) — aynı liste, sekme başına
  // farklı seçim.
  const { activeTaxpayerId } = useAuth();
  const current = useMemo(
    () => ctx.active.find((a) => a.taxpayerId === activeTaxpayerId) ?? null,
    [ctx.active, activeTaxpayerId],
  );
  return useMemo(() => ({ ...ctx, current }), [ctx, current]);
}
