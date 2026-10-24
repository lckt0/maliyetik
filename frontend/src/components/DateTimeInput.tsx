import { useEffect, useState } from 'react';
import { DateInput } from './DateInput';

/** Saat metnini yazarken iki hane sonrası iki nokta eklenir (ss:dd). */
function autoColon(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** `ss:dd` → geçerliyse normalize edilmiş hâli, değilse null. Tek haneli saat kabul edilir. */
function normalizeTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

const DEFAULT_TIME = '09:00';

interface Props {
  /** `<input type="datetime-local">` biçimi: `YYYY-MM-DDTHH:mm`. Boş string = değer yok. */
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}

/**
 * Tarih + saat girişi — GG/AA/YYYY ve SS:DD, tarayıcı/OS locale'inden BAĞIMSIZ.
 *
 * Native `<input type="datetime-local">` biçimini tarayıcının dil ayarından alıyor;
 * İngilizce bir tarayıcıda alan AA/GG/YYYY ve 12 saatlik AM/PM olarak görünüyordu —
 * sayfanın `lang="tr"` olması bunu değiştirmiyor. Tarih tarafı zaten aynı gerekçeyle
 * yazılmış `DateInput`i kullanır (bkz. components/DateInput.tsx); saat için de metin
 * girişi tercih edildi, çünkü `<input type="time">` aynı locale sorununu taşıyor.
 *
 * Dışarıya verilen değer native alanın biçimiyle aynı kalır, böylece notes.tsx'teki
 * `isoToLocalInput` / `localInputToIso` dönüştürücüleri değişmeden çalışır.
 */
export function DateTimeInput({ value, onChange, autoFocus }: Props) {
  const [datePart, timePart] = value ? value.split('T') : ['', ''];
  const [timeText, setTimeText] = useState(timePart ?? '');

  useEffect(() => {
    setTimeText(value ? (value.split('T')[1] ?? '') : '');
  }, [value]);

  function setDate(iso: string) {
    if (!iso) return onChange('');
    // Tarih seçilip saat boş bırakıldığında sabah dokuz varsayılır; kullanıcıyı
    // hatırlatıcı kuramaz hâlde bırakmamak için.
    onChange(`${iso}T${normalizeTime(timeText) ?? DEFAULT_TIME}`);
  }

  function commitTime(raw: string) {
    const normalized = normalizeTime(raw);
    if (!normalized) {
      setTimeText(timePart ?? '');
      return;
    }
    setTimeText(normalized);
    if (datePart) onChange(`${datePart}T${normalized}`);
  }

  return (
    <div className="datetime-input">
      <DateInput value={datePart} onChange={setDate} />
      <input
        type="text"
        inputMode="numeric"
        className="datetime-input-time"
        placeholder="ss:dd"
        aria-label="Saat"
        autoFocus={autoFocus}
        value={timeText}
        onChange={(e) => setTimeText(autoColon(e.target.value))}
        onBlur={(e) => commitTime(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commitTime((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).blur(); }
          else if (e.key === 'Escape') { setTimeText(timePart ?? ''); (e.target as HTMLInputElement).blur(); }
        }}
      />
    </div>
  );
}
