/**
 * Kullanıcıya görünen tarih biçimi: GG/AA/YYYY.
 * Arayüzdeki `frontend/src/utils/date.ts` ile aynı biçim — e-posta, bildirim ve
 * hata mesajlarında farklı bir biçim çıkmasın diye burada da tek kaynak var.
 *
 * Saat dilimi her zaman Europe/Istanbul: sunucu UTC çalışıyor, ham `getDate()`
 * gece yarısına yakın kayıtlarda bir gün geriye kayıyordu.
 */
const TZ = 'Europe/Istanbul';

function partsOf(value: Date, withTime: boolean): string {
  const fmt = new Intl.DateTimeFormat('tr-TR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  });
  const p = Object.fromEntries(fmt.formatToParts(value).map((x) => [x.type, x.value]));
  const date = `${p.day}/${p.month}/${p.year}`;
  return withTime ? `${date} ${p.hour}:${p.minute}` : date;
}

/** GG/AA/YYYY */
export function formatDateTr(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : partsOf(d, false);
}

/** GG/AA/YYYY SS:DD */
export function formatDateTimeTr(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '' : partsOf(d, true);
}
