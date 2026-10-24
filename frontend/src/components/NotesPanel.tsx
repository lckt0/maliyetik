import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import { isoToLocalInput, localInputToIso, NoteItem, useNotes } from '../notes';
import { BellIcon, CheckCircleIcon, PinIcon, PlusIcon, TrashIcon } from './Icons';
import { DateTimeInput } from './DateTimeInput';
import { relativeTime } from '../utils/time';
import { formatDateTime } from '../utils/date';

/** Hatırlatma zamanını kullanıcıya okunur biçimde gösterir (GG/AA/YYYY SS:DD). */
function formatRemind(iso: string | null | undefined): string {
  return formatDateTime(iso);
}

function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

/** Hızlı hatırlatma kısayolları — kullanıcı takvimle uğraşmadan tek tıkla kurabilsin. */
const QUICK_REMINDERS: { label: string; minutes: number }[] = [
  { label: '1 saat', minutes: 60 },
  { label: 'Yarın 09:00', minutes: -1 },
  { label: '1 hafta', minutes: 60 * 24 * 7 },
];

function quickReminderIso(minutes: number): string {
  const d = new Date();
  if (minutes === -1) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else {
    d.setMinutes(d.getMinutes() + minutes);
  }
  return d.toISOString();
}

/**
 * Hatırlatıcı seçici — küçük bir zil ikonuna basılınca açılan popover.
 *
 * Önceden not ekleme formunda sürekli açık duruyordu: bir etiket, bir datetime alanı
 * ve üç kısayol düğmesi, yani notların çoğunda hiç kullanılmayan dört satır. Hatırlatıcı
 * isteğe bağlı olduğu için varsayılan durumda hiç yer kaplamaması gerekiyor.
 */
function ReminderPopover({ value, onChange, onClose }: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Dışarı tıklama ve Escape ile kapanır — popover'ın kendi içindeki tıklamalar
  // (takvim açma dahil) kapatmamalı.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="note-remind-pop" ref={ref} role="dialog" aria-label="Hatırlatıcı">
      <label>Ne zaman hatırlatılsın?</label>
      <DateTimeInput value={value} onChange={onChange} autoFocus />
      <div className="note-quick-row">
        {QUICK_REMINDERS.map((q) => (
          <button type="button" key={q.label} className="btn sm secondary"
            onClick={() => { onChange(isoToLocalInput(quickReminderIso(q.minutes))); onClose(); }}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="note-remind-pop-foot">
        {value && (
          <button type="button" className="btn sm secondary" onClick={() => { onChange(''); onClose(); }}>
            Kaldır
          </button>
        )}
        <button type="button" className="btn sm" onClick={onClose}>Tamam</button>
      </div>
    </div>
  );
}

interface Props {
  /** `compact`: sağ kenar çubuğu (dar). `full`: anasayfa/Ayarlar (geniş). */
  variant?: 'compact' | 'full';
  /** Yeni not formunu gizler — yalnızca listeleme istenen yerler için. */
  readOnly?: boolean;
}

/**
 * Kişisel notlar listesi + hatırlatıcı kurma. Sağ kenar çubuğu ve anasayfa özet paneli
 * aynı bileşeni kullanır; notlar sunucuda tutulduğu için iki yer de anında aynı veriyi
 * gösterir (bkz. notes.tsx).
 */
export function NotesPanel({ variant = 'compact', readOnly }: Props) {
  const { user } = useAuth();
  const { notes, loading, add, update, remove } = useNotes(user?.userId);
  const [draft, setDraft] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingReminder, setEditingReminder] = useState<string | null>(null);
  const [remindOpen, setRemindOpen] = useState(false);

  const open = notes.filter((n) => !n.doneAt);
  const done = notes.filter((n) => n.doneAt);

  async function submit() {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await add(draft, remindAt ? localInputToIso(remindAt) : null);
      setDraft('');
      setRemindAt('');
      setRemindOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function renderNote(n: NoteItem) {
    return (
      <li key={n.id} className={`rs-note ${n.pinned ? 'pinned' : ''} ${n.doneAt ? 'done' : ''}`}>
        <p className="rs-note-text">{n.content}</p>
        {n.remindAt && !n.doneAt && (
          <div className={`note-reminder ${isPast(n.remindAt) ? 'past' : ''}`}>
            <BellIcon /> {isPast(n.remindAt) ? 'Hatırlatıldı' : 'Hatırlatma'}: {formatRemind(n.remindAt)}
          </div>
        )}
        {editingReminder === n.id && (
          <div className="note-reminder-edit">
            <DateTimeInput value={isoToLocalInput(n.remindAt)}
              onChange={(v) => void update(n.id, { remindAt: localInputToIso(v) })} />
            <div className="note-quick-row">
              {QUICK_REMINDERS.map((q) => (
                <button type="button" key={q.label} className="btn sm secondary"
                  onClick={() => void update(n.id, { remindAt: quickReminderIso(q.minutes) }).then(() => setEditingReminder(null))}>
                  {q.label}
                </button>
              ))}
              {n.remindAt && (
                <button type="button" className="btn sm secondary"
                  onClick={() => void update(n.id, { remindAt: null }).then(() => setEditingReminder(null))}>
                  Kaldır
                </button>
              )}
              <button type="button" className="btn sm" onClick={() => setEditingReminder(null)}>Tamam</button>
            </div>
          </div>
        )}
        <div className="rs-note-foot">
          <span className="rs-item-time">{relativeTime(new Date(n.createdAt).getTime())}</span>
          <div className="rs-note-actions">
            <button type="button" className="icon-btn sm" title={n.remindAt ? 'Hatırlatmayı düzenle' : 'Hatırlatıcı ekle'}
              onClick={() => setEditingReminder((cur) => (cur === n.id ? null : n.id))}>
              <BellIcon className={n.remindAt ? 'pinned' : ''} />
            </button>
            <button type="button" className="icon-btn sm" title={n.doneAt ? 'Geri al' : 'Tamamlandı'}
              onClick={() => void update(n.id, { done: !n.doneAt })}>
              <CheckCircleIcon />
            </button>
            <button type="button" className="icon-btn sm" title={n.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
              onClick={() => void update(n.id, { pinned: !n.pinned })}>
              <PinIcon className={n.pinned ? 'pinned' : ''} />
            </button>
            <button type="button" className="icon-btn sm danger" title="Sil" onClick={() => void remove(n.id)}>
              <TrashIcon />
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <div className={`notes-panel ${variant}`}>
      {loading && <p className="rs-empty">Yükleniyor…</p>}
      {!loading && notes.length === 0 && <p className="rs-empty">Henüz not yok.</p>}

      <ul className="rs-notes">{open.map(renderNote)}</ul>
      {done.length > 0 && (
        <details className="notes-done">
          <summary>Tamamlananlar ({done.length})</summary>
          <ul className="rs-notes">{done.map(renderNote)}</ul>
        </details>
      )}

      {!readOnly && (
        <div className="rs-notes-form">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(); }}
            placeholder="Kendinize bir not bırakın…" rows={2} />
          <div className="note-form-foot">
            <div className="note-remind-wrap">
              <button type="button" className={`icon-btn sm ${remindAt ? 'active' : ''}`}
                title={remindAt ? `Hatırlatma: ${formatRemind(localInputToIso(remindAt))}` : 'Hatırlatıcı ekle (opsiyonel)'}
                aria-label="Hatırlatıcı" aria-expanded={remindOpen}
                onClick={() => setRemindOpen((o) => !o)}>
                <BellIcon className={remindAt ? 'pinned' : ''} />
              </button>
              {remindOpen && (
                <ReminderPopover value={remindAt} onChange={setRemindAt} onClose={() => setRemindOpen(false)} />
              )}
            </div>
            {remindAt && (
              <button type="button" className="note-remind-chip" onClick={() => setRemindOpen(true)}
                title="Hatırlatmayı değiştir">
                {formatRemind(localInputToIso(remindAt))}
              </button>
            )}
            <button type="button" className="btn sm" onClick={() => void submit()} disabled={!draft.trim() || busy}>
              <PlusIcon /> {busy ? 'Ekleniyor…' : 'Ekle'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
