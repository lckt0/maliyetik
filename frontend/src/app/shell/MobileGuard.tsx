import { ReactNode, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth';
import { BuildingIcon } from '../../components/Icons';
import { TaxpayerPicker } from './TaxpayerPicker';

/**
 * Mobil uygulamaya giriş kontrolü.
 *
 * Rol engeli backend'de, admin panelindeki anahtarlarla yönetiliyor
 * (AuthService.assertMobileAccess) — yani buraya yalnızca erişimi açık bir hesap gelebilir.
 * Burada kalan tek gereklilik mükellef BAĞLAMI: mali müşavir ve admin kendi adına değil
 * bir mükellef adına işlem yapar, seçim yapılmadan evrak listesi/yükleme anlamsızdır.
 */
export function MobileGuard({ children }: { children: ReactNode }) {
  const { user, activeTaxpayerId } = useAuth();
  const location = useLocation();
  const [picking, setPicking] = useState(false);

  if (!user) return <Navigate to="/giris" state={{ from: location }} replace />;

  const needsContext = user.role === 'accountant' || user.role === 'admin';
  if (needsContext && !activeTaxpayerId) {
    return (
      <>
        <div className="m-auth">
          <div className="m-auth-logo" aria-hidden="true"><BuildingIcon width={30} height={30} /></div>
          <h1>Mükellef seçin</h1>
          <p className="m-auth-sub">
            {user.role === 'admin'
              ? 'Admin olarak tüm mükellefler adına işlem yapabilirsiniz. Devam etmek için bir mükellef seçin.'
              : 'Evraklarını görüntülemek ve tarama yapmak istediğiniz mükellefi seçin.'}
          </p>
          <button type="button" className="m-btn" onClick={() => setPicking(true)}>
            <BuildingIcon width={18} height={18} /> Mükellef Seç
          </button>
        </div>
        {picking && <TaxpayerPicker onClose={() => setPicking(false)} />}
      </>
    );
  }

  return <>{children}</>;
}
