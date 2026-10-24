import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { useAuth } from '../../auth';
import { useMyTaxpayers } from '../../taxpayers';
import { useDataVersion } from '../../dataBus';
import { DashboardPanelWidgets } from '../../components/DashboardPanelWidgets';
import { AnnouncementsPanel } from '../../components/AnnouncementsPanel';
import { Spinner } from '../../components/Spinner';
import { NotifyTaxpayersModal } from '../../components/NotifyTaxpayersModal';
import { AiInsightsPanel } from '../../components/AiInsightsPanel';
import {
  AlertCircleIcon, BellIcon, ExportIcon, ExternalWindowIcon, FolderIcon, ImportIcon,
  ScanIcon, UploadIcon, UsersIcon,
} from '../../components/Icons';
import { relativeTime } from '../../utils/time';
import { openTaxpayerTab, TAXPAYER_TAB_HOME } from '../../tabs';
import { TaxpayerOverviewRow } from '../../types';

/** Kaç gün evrak gelmezse "sessiz" sayılır — müşavirin takip etmesi gereken eşik. */
const STALE_DAYS = 20;

function isStale(lastUploadAt: string | null): boolean {
  if (!lastUploadAt) return true;
  return Date.now() - new Date(lastUploadAt).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Mali Müşavir anasayfası.
 *
 * Müşavir paneli mükellef panelinin birebir kopyasıydı; her şey "seçili mükellef"
 * üzerinden çalıştığı için müşavir hangi mükellefine dönmesi gerektiğini ancak tek tek
 * gezerek anlayabiliyordu. Buradaki pano ayın kapanışındaki asıl soruyu cevaplıyor:
 * kimde eksik evrak var, kimin dijitalleştirme kuyruğu birikmiş, kimden uzun süredir
 * evrak gelmemiş. Satırdan tek tıkla o mükellefe geçilir.
 */
export function AccountantDashboard() {
  const { user, activeTaxpayerId } = useAuth();
  const { all, active, current } = useMyTaxpayers();
  const pending = all.filter((a) => a.status === 'pending');
  const docsVersion = useDataVersion('documents');

  const [rows, setRows] = useState<TaxpayerOverviewRow[] | null>(null);
  /** Bildirim modalı — null kapalı, string önceden seçili mükellef. */
  const [notifyFor, setNotifyFor] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    apiGet<TaxpayerOverviewRow[]>('/accountants/overview')
      .then(setRows)
      .catch(() => setRows([]));
  }, [docsVersion, active.length]);

  const needsAttention = (rows ?? []).filter(
    (r) => r.missingCompanyDocs > 0 || r.pendingDigitize > 0 || isStale(r.lastUploadAt),
  );
  const totalPending = (rows ?? []).reduce((n, r) => n + r.pendingDigitize, 0);
  const totalThisMonth = (rows ?? []).reduce((n, r) => n + r.documentsThisMonth, 0);

  return (
    <>
      <div className="dashboard-hero">
        <h1>Merhaba, {user?.fullName?.split(' ')[0] ?? 'hoş geldiniz'} 👋</h1>
        <p className="muted">
          Mali Müşavir Paneli — mükelleflerinizin durumunu buradan takip edin, işlem yapmak için
          üst bardan mükellef seçin.
        </p>
      </div>

      {/* Özet kutuları: rakam solda, etiket ve eylem sağda. Önceden dört tam boy `card`
          idi ve ekranın üst üçte birini yiyordu; asıl iş olan Mükellef Panosu ilk bakışta
          görünmüyordu. Yükseklik ~130px'ten ~50px'e indi. */}
      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-tile-value">{active.length}</span>
          <span className="stat-tile-body">
            <span className="stat-tile-label">Aktif Mükellef</span>
            <Link to="/musavir/mukellefler" className="stat-tile-link">Mükelleflerim →</Link>
          </span>
        </div>
        <div className={`stat-tile ${pending.length > 0 ? 'attn' : ''}`}>
          <span className="stat-tile-value">{pending.length}</span>
          <span className="stat-tile-body">
            <span className="stat-tile-label">Bekleyen Talep</span>
            {pending.length > 0
              ? <Link to="/musavir/mukellefler" className="stat-tile-link">Onayla →</Link>
              : <span className="stat-tile-link muted">Talep yok</span>}
          </span>
        </div>
        <div className="stat-tile">
          <span className="stat-tile-value">{totalThisMonth}</span>
          <span className="stat-tile-body">
            <span className="stat-tile-label">Bu Ay Gelen Evrak</span>
            <span className="stat-tile-link muted">Tüm mükellefleriniz</span>
          </span>
        </div>
        <div className={`stat-tile ${totalPending > 0 ? 'attn' : ''}`}>
          <span className="stat-tile-value">{totalPending}</span>
          <span className="stat-tile-body">
            <span className="stat-tile-label">Dijitalleştirme Kuyruğu</span>
            {totalPending > 0
              ? <Link to="/musavir/dijitallestir" className="stat-tile-link">Kuyruğa git →</Link>
              : <span className="stat-tile-link muted">Kuyruk boş</span>}
          </span>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}>
        <h2><UsersIcon /> Mükellef Panosu</h2>
        {needsAttention.length > 0 && (
          <span className="badge revoked">{needsAttention.length} mükellef ilgi bekliyor</span>
        )}
        <button type="button" className="btn sm secondary" onClick={() => setNotifyFor(null)}>
          <BellIcon /> Bildirim Gönder
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Eksik şirket evrağı ve dijitalleştirme kuyruğu olanlar üstte. Bir satıra tıklayarak o
        mükellefle çalışmaya başlayabilirsiniz.
      </p>

      {rows === null && <Spinner label="Mükellef durumu yükleniyor…" />}

      {rows && rows.length === 0 && (
        <div className="card">
          <p style={{ marginTop: 0 }}>Henüz aktif mükellefiniz yok.</p>
          <Link className="btn" to="/musavir/mukellefler">Mükellef Ekle</Link>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="compact">
            <thead>
              <tr>
                <th>Mükellef</th><th>VKN/TCKN</th>
                <th style={{ textAlign: 'right' }}>Bu Ay</th>
                <th style={{ textAlign: 'right' }}>Kuyrukta</th>
                <th>Şirket Evrakları</th><th>Son Evrak</th><th>Kota</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const selected = r.taxpayerId === activeTaxpayerId;
                const quotaPct = r.quotaLimit > 0 ? Math.round((r.quotaUsed / r.quotaLimit) * 100) : 0;
                return (
                  <tr key={r.taxpayerId} className={selected ? 'row-active' : undefined}>
                    <td>
                      <b>{r.companyTitle}</b>
                      {selected && <span className="badge active" style={{ marginLeft: 6 }}>seçili</span>}
                    </td>
                    <td className="muted">{r.vknTckn}</td>
                    <td style={{ textAlign: 'right' }}>{r.documentsThisMonth}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.pendingDigitize > 0
                        ? <span className="badge revoked">{r.pendingDigitize}</span>
                        : <span className="muted">0</span>}
                    </td>
                    <td>
                      {r.missingCompanyDocs > 0
                        ? <span className="badge revoked"><AlertCircleIcon /> {r.missingCompanyDocs} eksik</span>
                        : <span className="badge active">Tam</span>}
                    </td>
                    <td className={isStale(r.lastUploadAt) ? 'muted' : undefined}>
                      {r.lastUploadAt ? relativeTime(r.lastUploadAt) : 'hiç'}
                      {isStale(r.lastUploadAt) && <span className="badge" style={{ marginLeft: 6 }}>sessiz</span>}
                    </td>
                    <td>
                      {r.quotaVisible
                        ? <span className={quotaPct >= 90 ? 'badge revoked' : ''}>{r.quotaUsed} / {r.quotaLimit}</span>
                        : <span className="muted" title="Mükellef kota paylaşımını kapatmış">gizli</span>}
                    </td>
                    <td className="row-actions">
                      {/* Panodaki "Aç" mükellefi KENDİ sekmesinde açar; o mükellefin sekmesi
                          zaten varsa yenisi açılmaz, ona geçilir (bkz. tabs.tsx). */}
                      <button type="button" className={`btn sm ${selected ? 'secondary' : ''}`}
                        title={selected ? 'Bu sekmenin mükellefi' : 'Kendi sekmesinde aç'}
                        onClick={() => openTaxpayerTab(r.taxpayerId, TAXPAYER_TAB_HOME, {
                          taxpayerTitle: r.companyTitle ?? null,
                        })}>
                        <ExternalWindowIcon /> {selected ? 'Sekmesine Git' : 'Aç'}
                      </button>
                      <button type="button" className="icon-btn sm" title="Bildirim gönder"
                        onClick={() => setNotifyFor(r.taxpayerId)}>
                        <BellIcon />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTaxpayerId && (
        <div style={{ marginTop: '1.5rem' }}>
          <AiInsightsPanel taxpayerId={activeTaxpayerId} />
        </div>
      )}

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h2>Müşavir Araçları</h2></div>
      <div className="grid cols-4">
        <Link to="/musavir/yukle" className="card quick-action-card">
          <span className="quick-action-icon"><UploadIcon /></span>
          <div><b>Evrak Yükle</b><div className="muted">{current?.taxpayer?.companyTitle ?? 'Mükellef seçin'}</div></div>
        </Link>
        <Link to="/musavir/dijitallestir" className="card quick-action-card">
          <span className="quick-action-icon"><ScanIcon /></span>
          <div><b>Evrak Dijitalleştir</b><div className="muted">Eksik alanları tamamla</div></div>
        </Link>
        <Link to="/musavir/yukle" className="card quick-action-card">
          <span className="quick-action-icon"><ImportIcon /></span>
          <div><b>Luca&apos;dan İçe Aktar</b><div className="muted">e-Fatura/e-Arşiv zip</div></div>
        </Link>
        <Link to="/musavir/disa-aktar" className="card quick-action-card">
          <span className="quick-action-icon"><ExportIcon /></span>
          <div><b>Luca&apos;ya Dışa Aktar</b><div className="muted">Z-Raporu fiş aktarımı</div></div>
        </Link>
        <Link to="/musavir/evraklar" className="card quick-action-card">
          <span className="quick-action-icon"><FolderIcon /></span>
          <div><b>Evraklar</b><div className="muted">Seçili mükellefin arşivi</div></div>
        </Link>
        <Link to="/musavir/kdv" className="card quick-action-card">
          <span className="quick-action-icon"><UsersIcon /></span>
          <div><b>KDV Hesaplama</b><div className="muted">Dönemsel KDV özeti</div></div>
        </Link>
      </div>

      <AnnouncementsPanel />
      <DashboardPanelWidgets />

      {notifyFor !== undefined && (
        <NotifyTaxpayersModal initialTaxpayerId={notifyFor} onClose={() => setNotifyFor(undefined)} />
      )}
    </>
  );
}
