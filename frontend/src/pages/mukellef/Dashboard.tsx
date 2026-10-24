import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { useDataVersion } from '../../dataBus';
import { useAuth } from '../../auth';
import { QuotaSummary } from '../../types';
import { DashboardPanelWidgets } from '../../components/DashboardPanelWidgets';
import { AnnouncementsPanel } from '../../components/AnnouncementsPanel';
import { CompanyDocsStatusWidget } from '../../components/CompanyDocsStatusWidget';
import { AiInsightsPanel } from '../../components/AiInsightsPanel';
import { AlertCircleIcon, CameraIcon, FolderIcon, GaugeIcon, ScanIcon, UploadIcon, UserIcon } from '../../components/Icons';
import { Paginated, DocumentRow } from '../../types';

interface Profile {
  companyTitle: string;
  vknTckn: string;
  currentAccountant?: { displayTitle: string } | null;
}

export function TaxpayerDashboard() {
  const { user } = useAuth();
  // Evrak/kota değişince (yükleme, silme, admin tahsisi) anasayfa da tazelensin.
  const quotaVersion = useDataVersion('quota');
  const [quota, setQuota] = useState<QuotaSummary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  /** Alanları eksik (dijitalleştirme bekleyen) evrak sayısı — mükellefin tek "yapılacak"ı. */
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    apiGet<QuotaSummary>('/quota/me').then(setQuota).catch(() => {});
    apiGet<Profile>('/taxpayers/me').then(setProfile).catch(() => {});
    apiGet<Paginated<DocumentRow>>('/documents', { isDigitized: 'false', limit: 1, page: 1 })
      .then((r) => setPendingCount(r.total ?? r.items.length))
      .catch(() => setPendingCount(null));
  }, [quotaVersion]);

  const quotaPct = quota && quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;
  const quotaLow = quota ? quota.remaining <= Math.max(10, quota.limit * 0.1) : false;

  return (
    <>
      <div className="dashboard-hero">
        <h1>Merhaba, {user?.fullName?.split(' ')[0] ?? 'hoş geldiniz'} 👋</h1>
        <p className="muted">{profile?.companyTitle ?? 'Mükellef Paneli'}</p>
      </div>

      {quotaLow && quota && (
        <div className="alert error">
          Evrak kotanız azaldı — <b>{quota.remaining.toLocaleString('tr-TR')}</b> evrak hakkınız kaldı.{' '}
          <Link to="/abonelik">Planınızı yükseltin veya ek kota alın →</Link>
        </div>
      )}

      <div className="grid cols-3">
        <div className="card">
          <h3>Firma</h3>
          <div className="stat small">{profile?.companyTitle ?? '—'}</div>
          <div className="muted">VKN/TCKN: {profile?.vknTckn ?? '—'}</div>
        </div>
        <div className="card">
          <h3>Kalan Kota</h3>
          <div className="stat">{quota ? quota.remaining.toLocaleString('tr-TR') : '—'}</div>
          <div className="quota-bar" aria-hidden="true">
            <div className="quota-bar-fill" style={{ width: `${Math.min(100, quotaPct)}%` }} />
          </div>
          <div className="muted">{quota ? `${quota.used} / ${quota.limit} kullanıldı` : ''}</div>
        </div>
        <div className="card">
          <h3>Mali Müşavir</h3>
          <div className="stat small">{profile?.currentAccountant?.displayTitle ?? 'Atanmadı'}</div>
          {profile?.currentAccountant
            ? <Link to="/mukellef/musavir" className="muted">Yetkiyi yönet →</Link>
            : <Link to="/mukellef/musavir" className="muted">Müşavir yetkilendir →</Link>}
        </div>
      </div>

      {pendingCount !== null && pendingCount > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3><AlertCircleIcon /> Tamamlanmayı Bekleyen Evraklar</h3>
          <p style={{ marginTop: 0 }}>
            <b>{pendingCount}</b> evrağınızın fatura no, tarih, tutar gibi alanları henüz doldurulmadı.
            Bu alanlar dolmadan evraklar KDV hesaplamasına ve raporlara girmez.
          </p>
          <Link className="btn" to="/mukellef/dijitallestir"><ScanIcon /> Şimdi Tamamla</Link>
        </div>
      )}

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h2>Ne yapmak istersiniz?</h2></div>
      <div className="grid cols-3">
        <Link to="/mukellef/yukle" className="card quick-action-card">
          <span className="quick-action-icon"><UploadIcon /></span>
          <div><b>Evrak Yükle</b><div className="muted">Fatura, Z-raporu, makbuz, ekstre…</div></div>
        </Link>
        <a href="/app/" className="card quick-action-card">
          <span className="quick-action-icon"><CameraIcon /></span>
          <div><b>Telefonla Tara</b><div className="muted">Mobil uygulamayla kameradan yükle</div></div>
        </a>
        <Link to="/mukellef/evraklar" className="card quick-action-card">
          <span className="quick-action-icon"><FolderIcon /></span>
          <div><b>Evraklarım</b><div className="muted">Türe göre sorgula &amp; indir</div></div>
        </Link>
        <Link to="/mukellef/sirket" className="card quick-action-card">
          <span className="quick-action-icon"><FolderIcon /></span>
          <div><b>Şirket Evraklarım</b><div className="muted">İmza sirküsü, vergi levhası</div></div>
        </Link>
        <Link to="/abonelik?sekme=kota" className="card quick-action-card">
          <span className="quick-action-icon"><GaugeIcon /></span>
          <div><b>Kota</b><div className="muted">Kullanım ve bakiye</div></div>
        </Link>
        <Link to="/mukellef/musavir" className="card quick-action-card">
          <span className="quick-action-icon"><UserIcon /></span>
          <div><b>Mali Müşavirim</b><div className="muted">Yetkilendirme yönet</div></div>
        </Link>
      </div>

      <div className="grid cols-3" style={{ marginTop: '1rem' }}>
        <CompanyDocsStatusWidget taxpayerId={user?.taxpayerId ?? null} linkTo="/mukellef/sirket" />
      </div>

      <div style={{ marginTop: '1rem' }}>
        <AiInsightsPanel taxpayerId={user?.taxpayerId ?? null} />
      </div>

      <AnnouncementsPanel />
      <DashboardPanelWidgets />
    </>
  );
}
