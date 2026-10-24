import { useEffect, useRef, useState } from 'react';
import { displayToIso, isoToDisplay, parseIsoDate } from '../utils/date';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DOW = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

interface Props {
  /** ISO `YYYY-MM-DD` veya boş string. */
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  required?: boolean;
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Kullanıcı rakam yazdıkça gg/aa/yyyy ayırıcılarını otomatik ekler (Luca tarzı klavye girişi). */
function autoSlash(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * gg/aa/yyyy formatında klavyeyle yazılabilen veya takvimden seçilebilen tarih girişi.
 * Native `<input type=date>` yerine — tarayıcı/OS locale'inden bağımsız sabit format için.
 */
export function DateInput({ value, onChange, placeholder = 'gg/aa/yyyy', required }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => isoToDisplay(value));
  const [viewYear, setViewYear] = useState(() => (parseIsoDate(value) ?? new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (parseIsoDate(value) ?? new Date()).getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  function commitText(t: string) {
    const trimmed = t.trim();
    if (!trimmed) {
      setText('');
      if (value) onChange('');
      return;
    }
    const iso = displayToIso(trimmed);
    if (!iso) {
      setText(isoToDisplay(value));
      return;
    }
    const d = parseIsoDate(iso)!;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setText(isoToDisplay(iso));
    if (iso !== value) onChange(iso);
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        commitText(text);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
    // eslint-disable-next-line
  }, [text, value]);

  function openPanel() {
    const d = parseIsoDate(value) ?? new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setOpen(true);
  }

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    setViewMonth(m);
    setViewYear(y);
  }

  const selected = parseIsoDate(value);
  const startWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Pazartesi=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="date-input" ref={ref}>
      <input
        type="text"
        inputMode="numeric"
        className="date-input-trigger"
        placeholder={placeholder}
        value={text}
        required={required}
        onFocus={openPanel}
        onChange={(e) => setText(autoSlash(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commitText(text); setOpen(false); (e.target as HTMLInputElement).blur(); }
          else if (e.key === 'Escape') { setText(isoToDisplay(value)); setOpen(false); (e.target as HTMLInputElement).blur(); }
        }}
      />
      {open && (
        <div className="date-input-panel">
          <div className="date-input-nav">
            <button type="button" onClick={() => shiftMonth(-1)}>‹</button>
            <span>{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={() => shiftMonth(1)}>›</button>
          </div>
          <div className="date-input-grid date-input-dow">
            {DOW.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="date-input-grid">
            {cells.map((day, i) => {
              const isSelected = day != null && !!selected
                && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
              return day == null
                ? <span key={i} />
                : (
                  <button type="button" key={i}
                    className={`date-input-day ${isSelected ? 'selected' : ''}`}
                    onClick={() => { const iso = toIso(viewYear, viewMonth, day); setText(isoToDisplay(iso)); onChange(iso); setOpen(false); }}>
                    {day}
                  </button>
                );
            })}
          </div>
          {value && (
            <button type="button" className="date-input-clear" onClick={() => { setText(''); onChange(''); setOpen(false); }}>
              Temizle
            </button>
          )}
        </div>
      )}
    </div>
  );
}
