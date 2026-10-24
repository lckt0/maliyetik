import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import { homePathFor, useAuth } from '../auth';
import { useAutoDigitizeStatus, useMaliHafizaJobStatus } from '../hooks';
import { useIsTabActive } from '../tabs';
import { NotificationItem, Paginated } from '../types';
import { relativeTime } from '../utils/time';
import { BellIcon } from './Icons';
import { useUploadJob } from '../uploadManager';

const POLL_MS = 60_000;

/** Üst bar zil ikonu — okunmamış sayaç + son bildirimler dropdown'ı. */
export function NotificationBell() {
  const { user, activeTaxpayerId, setActiveTaxpayerId } = useAuth();
  const navigate = useNavigate();
  const autoDigitizeTaxpayerId = user?.role === 'accountant' ? activeTaxpayerId : user?.taxpayerId ?? null;
  const { status: autoDigitize, cancel: cancelAutoDigitize } = useAutoDigitizeStatus(autoDigitizeTaxpayerId);
  const autoDigitizeRunning = autoDigitize?.status === 'running';
  const uploadJob = useUploadJob();
  const uploadRunning = uploadJob?.status === 'running';
  const { status: maliHafiza } = useMaliHafizaJobStatus(autoDigitizeTaxpayerId);
  const maliHafizaStatus = maliHafiza && maliHafiza.status !== 'idle' ? maliHafiza.status : null;
  const maliHafizaRunning = maliHafizaStatus === 'analyzing' || maliHafizaStatus === 'saving';

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const wasRunningRef = useRef(false);

  function refreshUnread() {
    apiGet<{ count: number }>('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {});
  }

  // Sayaç yalnızca GÖRÜNEN sekmede yoklanır: sekmeler arka planda da mount kalıyor
  // (bkz. tabs.tsx), aksi halde açık sekme sayısı kadar istek atılırdı. Sekmeye
  // dönüldüğünde efekt yeniden çalışır ve sayaç anında tazelenir.
  const tabActive = useIsTabActive();
  useEffect(() => {
    if (!tabActive) return;
    refreshUnread();
    const timer = setInterval(refreshUnread, POLL_MS);
    return () => clearInterval(timer);
  }, [tabActive]);

  // Otomatik dijitalleştirme biter bitmez (rapor bildirimi backend'de oluşturulur) sayacı hemen
  // günceller — aksi halde en fazla 60sn'lik ana poll'u bekleyip "bitti ama bildirim gelmedi"
  // izlenimi verirdi.
  useEffect(() => {
    if (wasRunningRef.current && !autoDigitizeRunning) {
      refreshUnread();
      if (open) {
        apiGet<Paginated<NotificationItem>>('/notifications', { limit: 10 }).then((r) => setItems(r.items)).catch(() => {});
      }
    }
    wasRunningRef.current = autoDigitizeRunning;
  }, [autoDigitizeRunning, open]);

  // Mali Hafıza Raporu analiz/kayıt işi bitince de aynı "hemen tazele" numarası (bkz. yukarıdaki
  // otomatik dijitalleştirme efekti) — 60sn'lik ana poll'u beklemeden bildirim görünsün.
  const wasMaliHafizaRunningRef = useRef(false);
  useEffect(() => {
    if (wasMaliHafizaRunningRef.current && !maliHafizaRunning) {
      refreshUnread();
      if (open) {
        apiGet<Paginated<NotificationItem>>('/notifications', { limit: 10 }).then((r) => setItems(r.items)).catch(() => {});
      }
    }
    wasMaliHafizaRunningRef.current = maliHafizaRunning;
  }, [maliHafizaRunning, open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      apiGet<Paginated<NotificationItem>>('/notifications', { limit: 10 })
        .then((r) => setItems(r.items))
        .catch(() => setItems([]));
    }
  }

  // Optimistik güncelleme sonrası mutlaka refreshUnread() çağrılır: aksi halde arka
  // plandaki 60sn'lik poll ile yarışıp eski (okunmamış) sayıyı geri yazabiliyor, ya da
  // istek sessizce başarısız olduğunda sayaç yanlışlıkla düşük kalıyordu — "okundu ama
  // sayaç hâlâ duruyor" şikayetinin kaynağı buydu.
  /** Bildirim türüne göre ilgili sayfaya yönlendirir — ör. olası çift evrak
   *  bildirimi, işaretlenen evrakları gözden geçirip silebileceğiniz sayfayı açar. */
  function handleNotificationClick(n: NotificationItem) {
    markRead(n);
    if (n.type === 'possible_duplicate_document' && user) {
      const documentId = n.metadata?.documentId as string | undefined;
      const matchedIds = (n.metadata?.matchedDocumentIds as string[] | undefined) ?? [];
      const ids = [documentId, ...matchedIds].filter(Boolean).join(',');
      if (ids) {
        setOpen(false);
        navigate(`${homePathFor(user.role)}/cift-evrak?ids=${encodeURIComponent(ids)}`);
      }
    } else if ((n.type === 'mali_hafiza_analysis' || n.type === 'mali_hafiza_commit') && user) {
      // Müşavir başka bir mükellef bağlamındaysa, işin ait olduğu mükellefe geçirir —
      // aksi halde Evrak Dijitalleştir sayfası yanlış mükellefin (boş) durumunu gösterirdi.
      const taxpayerId = n.metadata?.taxpayerId as string | undefined;
      if (user.role === 'accountant' && taxpayerId && taxpayerId !== activeTaxpayerId) {
        setActiveTaxpayerId(taxpayerId);
      }
      setOpen(false);
      navigate(`${homePathFor(user.role)}/dijitallestir`);
    }
  }

  async function markRead(n: NotificationItem) {
    if (n.readAt) return;
    const prevItems = items;
    setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? prev);
    setUnread((c) => Math.max(0, c - 1));
    try {
      await apiPost(`/notifications/${n.id}/read`);
    } catch {
      setItems(prevItems);
    } finally {
      refreshUnread();
    }
  }

  async function markAllRead() {
    const prevItems = items;
    setItems((prev) => prev?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? prev);
    setUnread(0);
    try {
      await apiPost('/notifications/read-all');
    } catch {
      setItems(prevItems);
    } finally {
      refreshUnread();
    }
  }

  const autoDigitizePercent = autoDigitize?.total
    ? Math.round(((autoDigitize.processed ?? 0) / autoDigitize.total) * 100)
    : 0;
  const anyBackgroundJobRunning = autoDigitizeRunning || uploadRunning || maliHafizaRunning;

  return (
    <div className="notif-bell" ref={ref}>
      <button
        type="button"
        className={`icon-btn notif-bell-trigger ${anyBackgroundJobRunning ? 'notif-bell-active' : ''}`}
        onClick={toggle}
        title={autoDigitizeRunning
          ? `Otomatik dijitalleştirme çalışıyor: %${autoDigitizePercent} (${autoDigitize?.processed ?? 0}/${autoDigitize?.total ?? 0} evrak)`
          : uploadRunning
            ? `Evrak yükleniyor: %${uploadJob?.percent ?? 0}`
            : maliHafizaRunning
              ? maliHafizaStatus === 'analyzing' ? 'Mali Hafıza Raporu analiz ediliyor…' : 'Mali Hafıza Raporu kaydediliyor…'
              : 'Bildirimler'}
      >
        <BellIcon />
        {anyBackgroundJobRunning && <span className="notif-badge notif-badge-progress" />}
        {!anyBackgroundJobRunning && unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-panel-head">
            <span>Bildirimler</span>
            {/* Görünen sayfadaki değil, TOPLAM okunmamış sayısına göre gösterilir — aksi halde
                10'dan fazla okunmamış bildirim varsa (yalnızca ilk 10 yüklenir), görünenler
                tek tek okunduktan sonra buton kayboluyor ama sayaç sıfırlanamıyor, "okundu ama
                hâlâ duruyor" izlenimi veriyordu. */}
            {unread > 0 && (
              <button type="button" className="notif-mark-all" onClick={markAllRead}>Tümünü okundu işaretle</button>
            )}
          </div>
          {uploadJob && (
            <div className="notif-item notif-progress">
              <span className="notif-item-title">
                {uploadJob.status === 'running' && uploadJob.label}
                {uploadJob.status === 'done' && 'Evrak yükleme tamamlandı'}
                {uploadJob.status === 'error' && 'Evrak yükleme tamamlandı (hatalarla)'}
              </span>
              <div className="notif-progress-bar">
                <div className="notif-progress-bar-fill" style={{ width: `${uploadJob.percent}%` }} />
              </div>
              <span className="notif-item-body">
                {uploadJob.completed} / {uploadJob.total} evrak (%{uploadJob.percent})
                {uploadJob.failed > 0 && ` — ${uploadJob.failed} hata`}
              </span>
            </div>
          )}
          {maliHafizaRunning && (
            <div className="notif-item notif-progress">
              <span className="notif-item-title">
                {maliHafizaStatus === 'analyzing' ? 'Mali Hafıza Raporu analiz ediliyor…' : 'Mali Hafıza Raporu kaydediliyor…'}
              </span>
              <span className="notif-item-body">Bittiğinde bildirim alacaksınız.</span>
            </div>
          )}
          {autoDigitizeRunning && (
            <div className="notif-item notif-progress">
              <span className="notif-item-title">Otomatik dijitalleştirme çalışıyor…</span>
              <div className="notif-progress-bar">
                <div className="notif-progress-bar-fill" style={{ width: `${autoDigitizePercent}%` }} />
              </div>
              <span className="notif-item-body">
                {autoDigitize?.processed ?? 0} / {autoDigitize?.total ?? 0} evrak (%{autoDigitizePercent})
              </span>
              <button type="button" className="btn secondary notif-progress-stop" onClick={() => cancelAutoDigitize()}>
                Durdur
              </button>
            </div>
          )}
          <div className="notif-list thin-scroll">
            {items === null && <p className="muted" style={{ padding: '.6rem' }}>Yükleniyor…</p>}
            {items !== null && items.length === 0 && <p className="muted" style={{ padding: '.6rem' }}>Henüz bildirim yok.</p>}
            {items?.map((n) => (
              <button type="button" key={n.id} className={`notif-item ${n.readAt ? '' : 'unread'}`} onClick={() => handleNotificationClick(n)}>
                <span className="notif-item-title">{n.title}</span>
                {n.body && <span className="notif-item-body">{n.body}</span>}
                <span className="notif-item-time">{relativeTime(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
