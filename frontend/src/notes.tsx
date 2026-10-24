import { useCallback, useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from './api/client';
import { bumpData, useDataVersion } from './dataBus';

export interface NoteItem {
  id: string;
  content: string;
  /** MySQL tinyint → 0/1 gelir. */
  pinned: number;
  doneAt?: string | null;
  remindAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

const LEGACY_MIGRATED_KEY = 'maliyetik:notes-migrated';

interface LegacyNote { id: string; text: string; pinned: boolean; createdAt: number; }

/**
 * Eski sürümler notları yalnızca localStorage'da tutuyordu. Bu notlar kaybolmasın diye
 * ilk açılışta bir kez sunucuya kopyalanır;
 * kopya alındıktan sonra yerel kayıt silinir ve bayrak konur (aynı notlar tekrar
 * yüklenmesin).
 */
async function migrateLegacyNotes(userId: string): Promise<boolean> {
  const flagKey = `${LEGACY_MIGRATED_KEY}:${userId}`;
  const legacyKey = `rsidebar-notes:${userId}`;
  try {
    if (localStorage.getItem(flagKey)) return false;
    const raw = localStorage.getItem(legacyKey);
    localStorage.setItem(flagKey, '1');
    if (!raw) return false;
    const legacy = JSON.parse(raw) as LegacyNote[];
    if (!Array.isArray(legacy) || !legacy.length) return false;
    // Eskiden yeniye doğru gönderilir ki sunucudaki sıralama yereldekiyle aynı kalsın.
    for (const n of [...legacy].reverse()) {
      if (!n?.text?.trim()) continue;
      await apiPost('/notes', { content: n.text.trim().slice(0, 4000), pinned: !!n.pinned });
    }
    localStorage.removeItem(legacyKey);
    return true;
  } catch {
    return false;
  }
}

export interface NotesApi {
  notes: NoteItem[];
  loading: boolean;
  add: (content: string, remindAt?: string | null) => Promise<void>;
  update: (id: string, patch: { content?: string; pinned?: boolean; done?: boolean; remindAt?: string | null }) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/**
 * Sunucudaki kişisel notlar. Sağ kenar çubuğu, anasayfa özet paneli ve Ayarlar
 * sayfası aynı listeyi paylaşır; bir yerde eklenen not diğerlerinde anında görünür
 * (bkz. dataBus 'notes').
 */
export function useNotes(userId: string | undefined): NotesApi {
  const version = useDataVersion('notes');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setNotes([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const migrated = await migrateLegacyNotes(userId);
      const rows = await apiGet<NoteItem[]>('/notes').catch(() => [] as NoteItem[]);
      if (cancelled) return;
      setNotes(rows);
      setLoading(false);
      if (migrated) bumpData('notes');
    })();
    return () => { cancelled = true; };
  }, [userId, version]);

  const add = useCallback(async (content: string, remindAt?: string | null) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    await apiPost('/notes', { content: trimmed, ...(remindAt ? { remindAt } : {}) });
    bumpData('notes');
  }, []);

  const update = useCallback(async (id: string, patch: Parameters<NotesApi['update']>[1]) => {
    await apiPatch(`/notes/${id}`, patch);
    bumpData('notes');
  }, []);

  const remove = useCallback(async (id: string) => {
    await apiDelete(`/notes/${id}`);
    bumpData('notes');
  }, []);

  return { notes, loading, add, update, remove };
}

/** `<input type="datetime-local">` değeri ⇄ ISO. Tarayıcı yerel saatte verir, sunucu UTC ister. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
