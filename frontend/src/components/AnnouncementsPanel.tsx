import { useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet } from '../api/client';
import { Announcement, Paginated } from '../types';
import { relativeTime } from '../utils/time';
import { MegaphoneIcon, PencilIcon, TrashIcon } from './Icons';
import { AnnouncementEditModal } from './AnnouncementEditModal';
import { useDialog } from './DialogProvider';

const PAGE_SIZE = 10;

/** Anasayfa — admin tarafından gönderilen sistem duyuruları. Bildirimler widget'ından
 *  ayrıdır (bkz. DashboardPanelWidgets: type=system_announcement orada hariç tutulur).
 *  Liste kaydırıldıkça sonraki sayfayı otomatik yükler (bkz. sentinel + IntersectionObserver).
 *  `editable` yalnızca admin sayfalarından geçirilir — düzenle/sil aksiyonlarını açar. */
export function AnnouncementsPanel({ editable = false }: { editable?: boolean }) {
  const { confirm } = useDialog();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const sentinelRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    apiGet<Paginated<Announcement>>('/announcements', { limit: PAGE_SIZE })
      .then((r) => { setItems(r.items); setNextCursor(r.nextCursor); })
      .catch(() => { setItems([]); setNextCursor(null); });
  }, []);

  useEffect(() => {
    if (!sentinelRef.current || !listRef.current || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { root: listRef.current, threshold: 0.1 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line
  }, [nextCursor, items]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await apiGet<Paginated<Announcement>>('/announcements', { limit: PAGE_SIZE, cursor: nextCursor });
      setItems((prev) => [...(prev ?? []), ...r.items]);
      setNextCursor(r.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(a: Announcement) {
    if (!await confirm(`"${a.title}" duyurusu silinsin mi?`, { danger: true, confirmLabel: 'Sil' })) return;
    try {
      await apiDelete(`/admin/announcements/${a.id}`);
      setItems((prev) => prev?.filter((x) => x.id !== a.id) ?? null);
    } catch { /* liste eski haliyle kalır, kullanıcı tekrar deneyebilir */ }
  }

  return (
    <div className="card announcements-panel" style={{ marginTop: '1.5rem' }}>
      <h3><MegaphoneIcon /> Sistem Duyuruları</h3>
      {items === null && <p className="muted">Yükleniyor…</p>}
      {items !== null && items.length === 0 && <p className="muted">Henüz duyuru yok.</p>}
      <ul className="announcement-list" ref={listRef}>
        {items?.map((a) => (
          <li key={a.id}>
            <div className="announcement-head">
              <span className="announcement-title">{a.title}</span>
              <span className="widget-time">{relativeTime(a.updatedAt ?? a.createdAt)}</span>
            </div>
            <p className="announcement-body">{a.body}</p>
            {editable && (
              <div className="row-actions" style={{ marginTop: '.4rem' }}>
                <button type="button" className="icon-btn sm" title="Düzenle" onClick={() => setEditing(a)}><PencilIcon /></button>
                <button type="button" className="icon-btn sm danger" title="Sil" onClick={() => remove(a)}><TrashIcon /></button>
              </div>
            )}
          </li>
        ))}
        {items && items.length > 0 && nextCursor && (
          <li ref={sentinelRef} className="muted" style={{ textAlign: 'center', padding: '.5rem' }}>Yükleniyor…</li>
        )}
      </ul>
      {editing && (
        <AnnouncementEditModal
          announcement={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => setItems((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)}
        />
      )}
    </div>
  );
}
