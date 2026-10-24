import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError, apiGet } from '../../api/client';
import { useAuth } from '../../auth';
import { AnnouncementsPanel } from '../../components/AnnouncementsPanel';
import { ClockIcon, GaugeIcon, WalletIcon } from '../../components/Icons';
import { AdminStats, SystemMetrics } from '../../types';
import { formatBytes } from '../../utils/formatBytes';

const STATS_POLL_MS = 30_000;
const METRICS_POLL_MS = 10_000;

function Meter({ label, percent, detail }: { label: string; percent: number; detail?: string }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div style={{ marginBottom: '.9rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: '.3rem' }}>
        <span>{label}</span>
        <span className="muted">{detail ?? `${pct.toFixed(1)}%`}</span>
      </div>
      <div className="upload-progress-bar">
        <div className="upload-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    function loadStats() { apiGet<AdminStats>('/admin/stats').then((s) => !cancelled && setStats(s)).catch((e) => !cancelled && setError(apiError(e))); }
    function loadMetrics() { apiGet<SystemMetrics>('/admin/system-metrics').then((m) => !cancelled && setMetrics(m)).catch(() => {}); }
    loadStats(); loadMetrics();
    const statsTimer = setInterval(loadStats, STATS_POLL_MS);
    const metricsTimer = setInterval(loadMetrics, METRICS_POLL_MS);
    return () => { cancelled = true; clearInterval(statsTimer); clearInterval(metricsTimer); };
  }, []);

  return (
    <>
      <div className="dashboard-hero">
        <h1>Merhaba, {user?.fullName?.split(' ')[0] ?? 'Admin'} 👋</h1>
        <p className="muted">Sistem genelinde kullanıcı, evrak ve kaynak durumuna genel bakış.</p>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="section-head"><h2>Kullanıcılar</h2></div>
      <div className="grid cols-4">
        <div className="card"><h3>Toplam Kullanıcı</h3><div className="stat">{stats?.users.total ?? '—'}</div></div>
        <div className="card"><h3>Mükellef</h3><div className="stat">{stats?.users.taxpayers ?? '—'}</div></div>
        <div className="card"><h3>Mali Müşavir</h3><div className="stat">{stats?.users.accountants ?? '—'}</div></div>
        <div className="card"><h3>Onay Bekleyen</h3><div className="stat">{stats?.users.pending ?? '—'}</div></div>
        <div className="card"><h3>Aktif Kullanıcı</h3><div className="stat">{stats?.users.active ?? '—'}</div></div>
        <div className="card"><h3>Pasif Kullanıcı</h3><div className="stat">{stats?.users.suspended ?? '—'}</div></div>
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h2>Evraklar</h2></div>
      <div className="grid cols-4">
        <div className="card"><h3>Toplam Evrak</h3><div className="stat">{stats?.documents.count ?? '—'}</div></div>
        <div className="card"><h3>Toplam Evrak Boyutu</h3><div className="stat small">{stats ? formatBytes(stats.documents.totalBytes) : '—'}</div></div>
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h2>Hızlı İşlemler</h2></div>
      <div className="grid cols-3">
        <Link to="/admin/kota" className="card quick-action-card">
          <span className="quick-action-icon"><GaugeIcon /></span>
          <div><b>Kota Tahsis</b><div className="muted">Mükellefe kota ver</div></div>
        </Link>
        <Link to="/admin/denetim" className="card quick-action-card">
          <span className="quick-action-icon"><ClockIcon /></span>
          <div><b>Denetim Günlüğü</b><div className="muted">Tüm işlemleri görüntüle</div></div>
        </Link>
        <Link to="/admin/maliyetler" className="card quick-action-card">
          <span className="quick-action-icon"><WalletIcon /></span>
          <div><b>Altyapı Maliyetleri</b><div className="muted">Servis maliyetlerini takip et</div></div>
        </Link>
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h2>Sistem Kaynakları</h2></div>
      <div className="grid cols-3">
        <div className="card">
          <h3>Uygulama Sunucusu</h3>
          <Meter label="CPU Yükü" percent={metrics?.app.cpuLoadPercent ?? 0} />
          <Meter
            label="Bellek"
            percent={metrics ? (1 - metrics.app.memFreeBytes / metrics.app.memTotalBytes) * 100 : 0}
            detail={metrics ? `${formatBytes(metrics.app.memTotalBytes - metrics.app.memFreeBytes)} / ${formatBytes(metrics.app.memTotalBytes)}` : undefined}
          />
          <p className="muted" style={{ margin: 0, fontSize: '.76rem' }}>Süreç RSS: {metrics ? formatBytes(metrics.app.processRssBytes) : '—'}</p>
        </div>
        <div className="card">
          <h3>MySQL</h3>
          <Meter
            label="Bağlantılar"
            percent={metrics ? (metrics.mysql.threadsConnected / metrics.mysql.maxConnections) * 100 : 0}
            detail={metrics ? `${metrics.mysql.threadsConnected} / ${metrics.mysql.maxConnections}` : undefined}
          />
          <Meter label="InnoDB Buffer Pool" percent={metrics?.mysql.bufferPoolUsedPercent ?? 0} />
          <p className="muted" style={{ margin: 0, fontSize: '.76rem' }}>Veritabanı boyutu: {metrics ? formatBytes(metrics.mysql.dbSizeBytes) : '—'}</p>
        </div>
        <div className="card">
          <h3>Redis</h3>
          {metrics?.redis ? (
            <>
              <p className="stat small">{formatBytes(metrics.redis.usedMemoryBytes)}</p>
              <p className="muted" style={{ margin: 0, fontSize: '.82rem' }}>{metrics.redis.connectedClients} aktif bağlantı</p>
            </>
          ) : (
            <p className="muted">Bilgi alınamadı.</p>
          )}
        </div>
      </div>

      <AnnouncementsPanel />
    </>
  );
}

export function AdminAnnouncements() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      await api.post('/admin/announcements', { title, body });
      setMsg({ kind: 'success', text: 'Duyuru tüm kullanıcılara gönderildi.' });
      setTitle(''); setBody('');
      setRefreshKey((k) => k + 1);
    } catch (e) { setMsg({ kind: 'error', text: apiError(e) }); }
    finally { setBusy(false); }
  }

  return (
    <div className="admin-announcements-layout">
      <form className="card" onSubmit={submit}>
        <h3>Sistem Duyurusu Gönder</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Gönderilen duyuru tüm aktif kullanıcılara bildirim olarak düşer ve anasayfadaki
          "Sistem Duyuruları" bölümünde listelenir.
        </p>
        {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
        <div className="field">
          <label>Başlık <span className="req">*</span></label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={255} />
        </div>
        <div className="field">
          <label>Mesaj <span className="req">*</span></label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={4} />
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Gönderiliyor…' : 'Gönder'}</button>
      </form>

      <AnnouncementsPanel key={refreshKey} editable />
    </div>
  );
}

