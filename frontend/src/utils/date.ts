/**
 * Tarih yardımcıları — kullanıcıya görünen HER tarih buradan geçer.
 *
 * Biçim GG/AA/YYYY. Evrak tarihleri zaten `isoToDisplay`
 * ile bu biçimdeydi; sistem tarihleri (yükleme zamanı, kota geçmişi, denetim kaydı…)
 * ise doğrudan `toLocaleDateString('tr-TR')` çağırıyor ve NOKTALI biçim üretiyordu
 * (30.08.2026). İki biçim yan yana görünüyordu; hepsi buradaki tek kaynağa alındı.
 *
 * ISO <-> gösterim dönüşümleri (`isoToDisplay`, `displayToIso`) DateInput ve Luca
 * dışa aktarımı tarafından da kullanılır — Luca'nın beklediği biçim bir MAKİNE
 * arayüzüdür, gösterim biçimi değiştirilirken oraya dokunulmamalıdır.
 */

export function parseIsoDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const [y, m, d] = v.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** `YYYY-MM-DD` -> `dd/mm/yyyy`. Geçersiz/boşsa boş string. */
export function isoToDisplay(v: string | null | undefined): string {
  const d = parseIsoDate(v);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** `dd/mm/yyyy` (veya `dd.mm.yyyy` / `dd-mm-yyyy`) -> `YYYY-MM-DD`. Geçersizse null. */
export function displayToIso(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (mo < 1 || mo > 12) return null;
  const daysInMonth = new Date(y, mo, 0).getDate();
  if (d < 1 || d > daysInMonth) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parts(value: string | number | Date | null | undefined): {
  d: string; m: string; y: string; hh: string; mm: string;
} | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    d: p(date.getDate()),
    m: p(date.getMonth() + 1),
    y: String(date.getFullYear()),
    hh: p(date.getHours()),
    mm: p(date.getMinutes()),
  };
}

/** GG/AA/YYYY — geçersiz/boş değerde `fallback` (varsayılan "—"). */
export function formatDate(value: string | number | Date | null | undefined, fallback = '—'): string {
  const p = parts(value);
  return p ? `${p.d}/${p.m}/${p.y}` : fallback;
}

/** GG/AA/YYYY SS:DD */
export function formatDateTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  const p = parts(value);
  return p ? `${p.d}/${p.m}/${p.y} ${p.hh}:${p.mm}` : fallback;
}

/** Yalnızca saat — aynı gün içindeki kayıtlarda tarihi tekrarlamamak için. */
export function formatTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  const p = parts(value);
  return p ? `${p.hh}:${p.mm}` : fallback;
}

/**
 * `<input type="date">` için YYYY-AA-GG. Tarayıcı bu alanı kullanıcıya kendi yerel
 * biçiminde gösterir; DEĞERİ her zaman ISO olmak zorundadır — GG/AA/YYYY yazılırsa
 * alan sessizce boş kalır.
 */
export function toDateInputValue(value: string | number | Date | null | undefined): string {
  const p = parts(value);
  return p ? `${p.y}-${p.m}-${p.d}` : '';
}
