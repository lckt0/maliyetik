import { useEffect, useRef } from 'react';

interface Props {
  /** Sanitize edilmemiş HTML — sunucu kaydetmeden önce allowlist ile temizler. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/**
 * Hafif, bağımlılıksız zengin metin editörü (contentEditable + execCommand).
 * Yalnızca temel biçimlendirme sağlar: kalın/italik/altı çizili, liste, alıntı,
 * bağlantı. Çıktısı sunucuda `sanitizeBio` ile ayrıca temizlenir — burası
 * yalnızca yazma deneyimi, güvenlik sınırı değildir.
 */
export function RichTextEditor({ value, onChange, placeholder = 'Kendinizden bahsedin…' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focused = useRef(false);

  useEffect(() => {
    if (!ref.current || focused.current) return;
    // Blok etiketiyle sarılmamış ham içerik (ör. API'den gelen eski veri),
    // execCommand'ın (liste/alıntı) imleç konumunu kaybetmesine yol açabilir —
    // yükte tek bir <p> içine sarmalamak tutarlı davranış sağlar.
    const normalized = value && !/^\s*<(p|div|ul|ol|h[1-6]|blockquote)[ >]/i.test(value) ? `<p>${value}</p>` : value;
    if (ref.current.innerHTML !== (normalized || '')) {
      ref.current.innerHTML = normalized || '';
    }
  }, [value]);

  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? '');
  }

  function insertLink() {
    const url = window.prompt('Bağlantı adresi (https://…)');
    if (url) exec('createLink', url);
  }

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" title="Kalın" onMouseDown={(e) => { e.preventDefault(); exec('bold'); }}><b>K</b></button>
        <button type="button" title="İtalik" onMouseDown={(e) => { e.preventDefault(); exec('italic'); }}><i>İ</i></button>
        <button type="button" title="Altı çizili" onMouseDown={(e) => { e.preventDefault(); exec('underline'); }}><u>A</u></button>
        <span className="rte-sep" />
        <button type="button" title="Madde işaretli liste" onMouseDown={(e) => { e.preventDefault(); exec('insertUnorderedList'); }}>•—</button>
        <button type="button" title="Numaralı liste" onMouseDown={(e) => { e.preventDefault(); exec('insertOrderedList'); }}>1.</button>
        <button type="button" title="Alıntı" onMouseDown={(e) => { e.preventDefault(); exec('formatBlock', 'blockquote'); }}>&ldquo;</button>
        <span className="rte-sep" />
        <button type="button" title="Bağlantı ekle" onMouseDown={(e) => { e.preventDefault(); insertLink(); }}>🔗</button>
        <button type="button" title="Biçimlendirmeyi temizle" onMouseDown={(e) => { e.preventDefault(); exec('removeFormat'); }}>✕</button>
      </div>
      <div
        ref={ref}
        className="rte-content rich-text"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; }}
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
      />
    </div>
  );
}
