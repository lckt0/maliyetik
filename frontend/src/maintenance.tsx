import { useEffect, useState, ReactNode } from 'react';
import { apiGet } from './api/client';
import { SystemStatus } from './types';
import { MaintenancePage } from './pages/MaintenancePage';

const POLL_MS = 30_000;
export const MAINTENANCE_EVENT = 'maliyetik:maintenance';

/** Uygulama ağacını en dışta sarar — SPA açılışında ve arka planda periyodik olarak
 *  bakım modu durumunu kontrol eder, engellenmişse tüm uygulamanın yerine bakım sayfasını gösterir. */
export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const status = await apiGet<SystemStatus>('/system/status');
        if (!cancelled) setBlocked(status.maintenanceMode && !status.allowedForCaller);
      } catch {
        // /system/status'a bile ulaşılamıyorsa (ağ hatası vb.) kilitlemeyelim
      } finally {
        if (!cancelled) setChecked(true);
      }
    }

    check();
    const onMaintenance = () => setBlocked(true);
    window.addEventListener(MAINTENANCE_EVENT, onMaintenance);
    const interval = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener(MAINTENANCE_EVENT, onMaintenance);
      clearInterval(interval);
    };
  }, []);

  if (!checked) return null;
  if (blocked) return <MaintenancePage />;
  return <>{children}</>;
}
