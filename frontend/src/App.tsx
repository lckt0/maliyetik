import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, panelPathFor, useAuth } from './auth';
import { usePreferences } from './preferences';
import { Layout } from './components/Layout';
import { Spinner } from './components/Spinner';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { TaxpayerScoped } from './components/TaxpayerScoped';
import { lazyRoute } from './lazyRoute';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { EmailVerify } from './pages/EmailVerify';
import { ResetPassword } from './pages/ResetPassword';
import { Landing } from './pages/Landing';
import { PublicProfile } from './pages/PublicProfile';

// Kimlik doğrulaması gereken tüm sayfalar lazy — anonim bir ziyaretçi "/" (anasayfa)
// veya "/login"'e geldiğinde bu paketleri indirmez, yalnızca gerçekten panele
// girdiğinde ilgili rotanın chunk'ı yüklenir.
const Account = lazyRoute(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const Settings = lazyRoute(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const AccountUsage = lazyRoute(() => import('./pages/AccountUsage').then((m) => ({ default: m.AccountUsage })));
const PaymentResult = lazyRoute(() => import('./pages/PaymentResult').then((m) => ({ default: m.PaymentResult })));
const UploadHub = lazyRoute(() => import('./pages/UploadHub').then((m) => ({ default: m.UploadHub })));
const DigitizeQueue = lazyRoute(() => import('./pages/DigitizeQueue').then((m) => ({ default: m.DigitizeQueue })));
const Documents = lazyRoute(() => import('./pages/Documents').then((m) => ({ default: m.Documents })));
const CompanyDocuments = lazyRoute(() => import('./pages/CompanyDocuments').then((m) => ({ default: m.CompanyDocuments })));
const DocumentGroup = lazyRoute(() => import('./pages/DocumentGroup').then((m) => ({ default: m.DocumentGroup })));
const Trash = lazyRoute(() => import('./pages/Trash').then((m) => ({ default: m.Trash })));
const KdvHesaplama = lazyRoute(() => import('./pages/KdvHesaplama').then((m) => ({ default: m.KdvHesaplama })));
const DocumentLogs = lazyRoute(() => import('./pages/DocumentLogs').then((m) => ({ default: m.DocumentLogs })));
const DuplicateReview = lazyRoute(() => import('./pages/DuplicateReview').then((m) => ({ default: m.DuplicateReview })));
const TaxpayerDashboard = lazyRoute(() => import('./pages/mukellef/Dashboard').then((m) => ({ default: m.TaxpayerDashboard })));
const Musavir = lazyRoute(() => import('./pages/mukellef/Musavir').then((m) => ({ default: m.Musavir })));
const TaxpayerQuota = lazyRoute(() => import('./pages/musavir/TaxpayerQuota').then((m) => ({ default: m.TaxpayerQuota })));
const ExportHub = lazyRoute(() => import('./pages/musavir/ExportHub').then((m) => ({ default: m.ExportHub })));
const AccountantDashboard = lazyRoute(() => import('./pages/musavir/Dashboard').then((m) => ({ default: m.AccountantDashboard })));
const MusavirTaxpayers = lazyRoute(() => import('./pages/musavir/Taxpayers').then((m) => ({ default: m.MusavirTaxpayers })));
const AdminDashboard = lazyRoute(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminDashboard })));
const AdminAnnouncements = lazyRoute(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminAnnouncements })));
const AdminKota = lazyRoute(() => import('./pages/admin/AdminKota').then((m) => ({ default: m.AdminKota })));
const AdminAiCredits = lazyRoute(() => import('./pages/admin/AdminAiCredits').then((m) => ({ default: m.AdminAiCredits })));
const AdminUsers = lazyRoute(() => import('./pages/admin/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminSettings = lazyRoute(() => import('./pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })));
const AdminAuditLog = lazyRoute(() => import('./pages/admin/AdminAuditLog').then((m) => ({ default: m.AdminAuditLog })));
const AdminInfraCosts = lazyRoute(() => import('./pages/admin/AdminInfraCosts').then((m) => ({ default: m.AdminInfraCosts })));
const AdminPlans = lazyRoute(() => import('./pages/admin/AdminPlans').then((m) => ({ default: m.AdminPlans })));
const AdminPayments = lazyRoute(() => import('./pages/admin/AdminPayments').then((m) => ({ default: m.AdminPayments })));

// Ücretsiz araç sayfaları — herkese açık, kimlik doğrulaması gerektirmez.
const ToolsHub = lazyRoute(() => import('./pages/tools/ToolsHub').then((m) => ({ default: m.ToolsHub })));
const LegalIndex = lazyRoute(() => import('./pages/legal/LegalIndex').then((m) => ({ default: m.LegalIndex })));
const LegalDocument = lazyRoute(() => import('./pages/legal/LegalDocument').then((m) => ({ default: m.LegalDocument })));
const KdvHesaplamaTool = lazyRoute(() => import('./pages/tools/KdvHesaplamaTool').then((m) => ({ default: m.KdvHesaplamaTool })));
const KrediHesaplamaTool = lazyRoute(() => import('./pages/tools/KrediHesaplamaTool').then((m) => ({ default: m.KrediHesaplamaTool })));
const DesiHesaplamaTool = lazyRoute(() => import('./pages/tools/DesiHesaplamaTool').then((m) => ({ default: m.DesiHesaplamaTool })));
const StopajHesaplamaTool = lazyRoute(() => import('./pages/tools/StopajHesaplamaTool').then((m) => ({ default: m.StopajHesaplamaTool })));
const GelirVergisiHesaplamaTool = lazyRoute(() => import('./pages/tools/GelirVergisiHesaplamaTool').then((m) => ({ default: m.GelirVergisiHesaplamaTool })));

function RootRedirect() {
  const { user } = useAuth();
  const { landingPage } = usePreferences();
  return <Navigate to={user ? panelPathFor(user.role, landingPage) : '/'} replace />;
}

/**
 * Kurulmuş uygulamanın açılış adresi (manifest `start_url`, bkz. public/uygulama.webmanifest).
 * Oturum açıksa panele, değilse girişe düşer — uygulama ikonuna tıklayan kullanıcı hiçbir
 * zaman anasayfanın tanıtım sayfasına düşmez.
 */
function AppWindowEntry() {
  const { user } = useAuth();
  const { landingPage } = usePreferences();
  return <Navigate to={user ? panelPathFor(user.role, landingPage) : '/login'} replace />;
}

function LoginRoute() {
  const { user } = useAuth();
  const { landingPage } = usePreferences();
  if (user) return <Navigate to={panelPathFor(user.role, landingPage)} replace />;
  return <Login />;
}

function RegisterRoute() {
  const { user } = useAuth();
  const { landingPage } = usePreferences();
  if (user) return <Navigate to={panelPathFor(user.role, landingPage)} replace />;
  return <Register />;
}

export function App() {
  return (
    // fallback null DEĞİL: chunk inerken ekran tamamen boşalıyor ve yavaş bağlantıda
    // sayfa çökmüş gibi görünüyordu. Hata sınırı ise render sırasında atılan hatanın
    // tüm ağacı söküp boş sayfa bırakmasını engeller (bkz. RouteErrorBoundary).
    <RouteErrorBoundary>
      <Suspense fallback={<Spinner label="Yükleniyor…" />}>
        <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/uygulama" element={<AppWindowEntry />} />
        <Route path="/kayit" element={<RegisterRoute />} />
        <Route path="/dogrula" element={<EmailVerify />} />
        <Route path="/sifre-sifirla" element={<ResetPassword />} />
        <Route path="/u/:username" element={<PublicProfile />} />

        {/* Ücretsiz araçlar — herkese açık */}

        {/* Yasal metinler — herkese açık, giriş gerektirmez */}
        <Route path="/yasal" element={<LegalIndex />} />
        <Route path="/yasal/:slug" element={<LegalDocument />} />

        <Route path="/araclar" element={<ToolsHub />} />
        <Route path="/araclar/kdv-hesaplama" element={<KdvHesaplamaTool />} />
        <Route path="/araclar/kredi-hesaplama" element={<KrediHesaplamaTool />} />
        <Route path="/araclar/desi-hesaplama" element={<DesiHesaplamaTool />} />
        <Route path="/araclar/stopaj-hesaplama" element={<StopajHesaplamaTool />} />
        <Route path="/araclar/gelir-vergisi-hesaplama" element={<GelirVergisiHesaplamaTool />} />

        {/* Hesabım — role bağımsız, tüm oturum açmış kullanıcılar */}
        <Route path="/hesap" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Account />} />
        </Route>

        {/* Ayarlar — role bağımsız kişisel arayüz/bildirim tercihleri */}
        <Route path="/ayarlar" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Settings />} />
        </Route>

        {/* Hesap & Kullanım — abonelik + evrak kotası + AI kredisi tek sayfada (sekmeli).
            Mükellef ve müşavir için ayrı planlar, aynı sayfa. */}
        <Route path="/abonelik" element={<ProtectedRoute roles={['taxpayer', 'accountant']}><Layout /></ProtectedRoute>}>
          <Route index element={<AccountUsage />} />
        </Route>

        {/* Ödeme dönüşü — sağlayıcı callback'i sunucuda doğrulanıp buraya yönlendirilir */}
        <Route path="/odeme/sonuc" element={<ProtectedRoute roles={['taxpayer', 'accountant']}><Layout /></ProtectedRoute>}>
          <Route index element={<PaymentResult />} />
        </Route>

        {/* Mükellef paneli */}
        <Route path="/mukellef" element={<ProtectedRoute roles={['taxpayer']}><Layout /></ProtectedRoute>}>
          <Route index element={<TaxpayerDashboard />} />
          <Route path="yukle" element={<UploadHub />} />
          <Route path="dijitallestir" element={<DigitizeQueue />} />
          <Route path="evraklar" element={<Documents />} />
          <Route path="evraklar/grup/:typeId/:groupNo" element={<DocumentGroup endpoint="/documents" backTo="/mukellef/evraklar" />} />
          <Route path="sirket" element={<CompanyDocuments />} />
          <Route path="kdv" element={<KdvHesaplama />} />
          <Route path="cop-kutusu" element={<Trash />} />
          <Route path="loglar" element={<DocumentLogs />} />
          <Route path="cift-evrak" element={<DuplicateReview />} />
          <Route path="musavir" element={<Musavir />} />
          <Route path="kota" element={<Navigate to="/abonelik?sekme=kota" replace />} />
          <Route path="ai-kredi" element={<Navigate to="/abonelik?sekme=ai" replace />} />
        </Route>

        {/* Mali Müşavir paneli */}
        <Route path="/musavir" element={<ProtectedRoute roles={['accountant']}><Layout /></ProtectedRoute>}>
          {/* Ofis penceresi seviyesi — mükellef bağlamı gerektirmez. */}
          <Route index element={<AccountantDashboard />} />
          <Route path="mukellefler" element={<MusavirTaxpayers />} />
          <Route path="ai-kredi" element={<Navigate to="/abonelik?sekme=ai" replace />} />

          {/* Mükellef bazlı — yalnızca o mükellefin penceresinde açılır (bkz. TaxpayerScoped). */}
          <Route path="yukle" element={<TaxpayerScoped><UploadHub /></TaxpayerScoped>} />
          <Route path="dijitallestir" element={<TaxpayerScoped><DigitizeQueue /></TaxpayerScoped>} />
          <Route path="evraklar" element={<TaxpayerScoped><Documents /></TaxpayerScoped>} />
          <Route path="evraklar/grup/:typeId/:groupNo" element={<TaxpayerScoped><DocumentGroup endpoint="/documents" backTo="/musavir/evraklar" /></TaxpayerScoped>} />
          <Route path="sirket" element={<TaxpayerScoped><CompanyDocuments /></TaxpayerScoped>} />
          <Route path="kdv" element={<TaxpayerScoped><KdvHesaplama /></TaxpayerScoped>} />
          <Route path="cop-kutusu" element={<TaxpayerScoped><Trash /></TaxpayerScoped>} />
          <Route path="loglar" element={<TaxpayerScoped><DocumentLogs /></TaxpayerScoped>} />
          <Route path="cift-evrak" element={<TaxpayerScoped><DuplicateReview /></TaxpayerScoped>} />
          <Route path="disa-aktar" element={<TaxpayerScoped><ExportHub /></TaxpayerScoped>} />
          <Route path="mukellef-kota" element={<TaxpayerScoped><TaxpayerQuota /></TaxpayerScoped>} />
        </Route>

        {/* Admin paneli */}
        <Route path="/admin" element={<ProtectedRoute roles={['admin']}><Layout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="kullanicilar" element={<AdminUsers />} />
          <Route path="kota" element={<AdminKota />} />
          <Route path="ai-kredi" element={<AdminAiCredits />} />
          <Route path="duyurular" element={<AdminAnnouncements />} />
          <Route path="denetim" element={<AdminAuditLog />} />
          <Route path="maliyetler" element={<AdminInfraCosts />} />
          <Route path="planlar" element={<AdminPlans />} />
          <Route path="odemeler" element={<AdminPayments />} />
          <Route path="ayarlar" element={<AdminSettings />} />
        </Route>

        <Route path="*" element={<RootRedirect />} />
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}
