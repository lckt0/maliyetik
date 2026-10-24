import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth';
import { MobileGuard } from './shell/MobileGuard';
import { MobileShell } from './shell/MobileShell';
import { UpdateToast } from './shell/UpdateToast';
import { InstallSheet } from './shell/InstallSheet';
import { Login } from './pages/Login';

// Giriş dışındaki her şey lazy — açılış paketi küçük kalır; tarayıcı (kamera + OpenCV
// köprüsü) yalnızca kullanıcı gerçekten taramaya başlayınca indirilir.
const Documents = lazy(() => import('./pages/Documents').then((m) => ({ default: m.Documents })));
const DocumentDetail = lazy(() => import('./pages/DocumentDetail').then((m) => ({ default: m.DocumentDetail })));
const CompanyDocuments = lazy(() => import('./pages/CompanyDocuments').then((m) => ({ default: m.CompanyDocuments })));
const Upload = lazy(() => import('./pages/Upload').then((m) => ({ default: m.Upload })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const Scanner = lazy(() => import('./scanner/ScannerScreen').then((m) => ({ default: m.ScannerScreen })));

function Loading() {
  return <div className="m-loading"><span className="m-spinner" /> Yükleniyor…</div>;
}

function LoginRoute() {
  const { user } = useAuth();
  // Açılış sekmesi Evrak Yükle — uygulamanın birincil işi tarama, sekme çubuğunda da
  // ilk sırada. Müşavir/admin mükellef seçmemişse MobileGuard önce seçim ekranını gösterir.
  if (user) return <Navigate to="/yukle" replace />;
  return <Login />;
}

export function MobileApp() {
  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/giris" element={<LoginRoute />} />

          {/* Tarayıcı tam ekran çalışır — sekme çubuğu olmadan, kabuğun dışında. */}
          <Route path="/tara" element={<MobileGuard><Scanner /></MobileGuard>} />

          <Route element={<MobileGuard><MobileShell /></MobileGuard>}>
            <Route path="/evraklar" element={<Documents />} />
            <Route path="/evraklar/:id" element={<DocumentDetail />} />
            <Route path="/sirket" element={<CompanyDocuments />} />
            <Route path="/yukle" element={<Upload />} />
            <Route path="/profil" element={<Profile />} />
          </Route>

          <Route path="*" element={<Navigate to="/yukle" replace />} />
        </Routes>
      </Suspense>
      <UpdateToast />
      <InstallSheet />
    </>
  );
}
