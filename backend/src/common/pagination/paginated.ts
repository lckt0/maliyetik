/** Keyset (cursor) veya offset (page) tabanlı sayfalı sonuç zarfı. */
export interface Paginated<T> {
  items: T[];
  /** Sonraki sayfa için cursor; yoksa liste bitti. Sayfa (offset) modunda her zaman null. */
  nextCursor: string | null;
  limit: number;
  /** Yalnızca sayfa (offset) modunda — numaralı sayfalama UI'ı için. */
  total?: number;
  page?: number;
  totalPages?: number;
}

/** Opak keyset cursor kodla/çöz — `${documentDate}|${id}` gibi bileşik anahtar. */
export const Cursor = {
  encode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  },
  decode(cursor: string): string {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  },
};
