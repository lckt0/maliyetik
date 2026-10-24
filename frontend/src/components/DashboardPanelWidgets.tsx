import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useAuth } from '../auth';
import { useRightPanel } from '../rightPanel';
import { NotesPanel } from './NotesPanel';
import { relativeTime } from '../utils/time';
import { DocumentLogAction, DocumentLogEntry, NotificationItem, Paginated } from '../types';
import { BellIcon, ClockIcon, NoteIcon, StarIcon } from './Icons';

/** Bildirimler widget'ı, sistem duyurularını hariç tutar — onlar ayrı "Sistem
 *  Duyuruları" bölümünde (bkz. AnnouncementsPanel) gösterilir. */
const ANNOUNCEMENT_TYPE = 'system_announcement';

const ACTION_LABELS: Record<DocumentLogAction, string> = {
  uploaded: 'yükledi',
  updated: 'düzenledi',
  deleted: 'sildi',
  restored: 'geri yükledi',
  purged: 'kalıcı sildi',
  digitized: 'dijitalleştirdi',
};

/** Anasayfa özet paneli — favoriler, notlar, son gezinilen sayfalar ve son evrak logları. */
export function DashboardPanelWidgets() {
  const { user, activeTaxpayerId } = useAuth();
  const { favorites, recent } = useRightPanel();
  const [logs, setLogs] = useState<DocumentLogEntry[] | null>(null);
  const [notifs, setNotifs] = useState<NotificationItem[] | null>(null);

  // Müşavir için aktif mükellef seçilmeden loglar çekilmez — aksi halde yetkili olunan
  // TÜM mükelleflerin işlemleri karışık gösterilir (bkz. Documents/KdvHesaplama ile aynı desen).
  const needsTaxpayer = user?.role === 'accountant';
  const blocked = needsTaxpayer && !activeTaxpayerId;

  useEffect(() => {
    if (blocked) { setLogs([]); return; }
    const params: Record<string, string | number> = { limit: 8 };
    if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
    apiGet<Paginated<DocumentLogEntry>>('/documents/logs', params)
      .then((r) => setLogs(r.items))
      .catch(() => setLogs([]));
    // eslint-disable-next-line
  }, [blocked, activeTaxpayerId]);

  useEffect(() => {
    apiGet<Paginated<NotificationItem>>('/notifications', { limit: 6, excludeType: ANNOUNCEMENT_TYPE })
      .then((r) => setNotifs(r.items))
      .catch(() => setNotifs([]));
  }, []);

  return (
    <>
      <div className="section-head" style={{ marginTop: '1.5rem' }}><h2>Panelim</h2></div>
      <div className="grid cols-4 dashboard-widgets">
        <div className="card widget-card">
          <h3><StarIcon /> Favori Sayfalar</h3>
          <div className="widget-scroll thin-scroll">
            {favorites.length === 0 && <p className="muted">Henüz favori sayfa yok.</p>}
            <ul className="widget-list">
              {favorites.map((f) => (
                <li key={f.path}><Link to={f.path}>{f.label}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card widget-card">
          <h3><ClockIcon /> Son İşlemler</h3>
          <div className="widget-scroll thin-scroll">
            {recent.length === 0 && <p className="muted">Henüz gezinti geçmişi yok.</p>}
            <ul className="widget-list">
              {recent.map((r) => (
                <li key={r.path}><Link to={r.path}>{r.label}</Link><span className="widget-time">{relativeTime(r.ts)}</span></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card widget-card">
          <h3><NoteIcon /> Notlarım</h3>
          <div className="widget-scroll thin-scroll">
            {/* Notlar sunucuda tutuluyor; buradan hatırlatıcı da kurulabilir (bkz. notes.tsx). */}
            <NotesPanel variant="full" />
          </div>
        </div>

        <div className="card widget-card">
          <h3><BellIcon /> Bildirimler</h3>
          <div className="widget-scroll thin-scroll">
            {notifs === null && <p className="muted">Yükleniyor…</p>}
            {notifs !== null && notifs.length === 0 && <p className="muted">Henüz bildirim yok.</p>}
            <ul className="widget-list">
              {notifs?.map((n) => (
                <li key={n.id} className="widget-note">
                  <span><b>{n.title}</b></span>
                  <span className="widget-time">{relativeTime(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card widget-card">
          <h3><ClockIcon /> Son Evrak Logları</h3>
          <div className="widget-scroll thin-scroll">
            {blocked && <p className="muted">Önce bir mükellef seçin.</p>}
            {!blocked && logs !== null && logs.length === 0 && <p className="muted">Henüz kayıt yok.</p>}
            {!blocked && logs === null && <p className="muted">Yükleniyor…</p>}
            <ul className="widget-list">
              {logs?.map((l) => (
                <li key={l.id} className="widget-note">
                  <span>
                    <b>{l.actorName}</b> <span className="muted">{ACTION_LABELS[l.action]}</span> {l.metadata?.documentTitle ?? 'evrak'}
                  </span>
                  <span className="widget-time">{relativeTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
