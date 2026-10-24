import { useId, useRef, useState } from 'react';
import { UploadIcon } from './Icons';
import { formatBytes } from '../utils/formatBytes';

interface Props {
  /** `<input type=file accept>` değeri — ör. ".zip" veya "application/pdf". */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Kutunun içindeki birincil metin. */
  label: string;
  /** Kabul edilen dosya türlerini/limitleri anlatan alt metin. */
  hint?: string;
  /** Seçili dosya(lar) — kutuda özet olarak gösterilir. */
  files?: File[];
  onFiles: (files: File[]) => void;
}

/**
 * Sürükle-bırak + tıkla-seç dosya kutusu. Luca içe aktarma, toplu ZIP ve çoklu fatura
 * PDF akışlarının üçü de aynı kutuyu kullanır — dosya seçimi her yerde aynı görünsün ve
 * "dosyayı nereye bırakacağım" sorusu ortadan kalksın diye tek bileşende toplandı.
 */
export function FileDropzone({ accept, multiple, disabled, label, hint, files, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();

  function handleFiles(list: FileList | null) {
    if (!list || !list.length) return;
    onFiles(multiple ? Array.from(list) : [list[0]]);
  }

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''}`}
      onDragOver={(e) => { if (disabled) return; e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-describedby={hint ? `${inputId}-hint` : undefined}
    >
      <input ref={inputRef} id={inputId} type="file" accept={accept} multiple={multiple} disabled={disabled}
        style={{ display: 'none' }}
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
      <UploadIcon className="dropzone-icon" />
      <div className="dropzone-label">{label}</div>
      {hint && <div className="dropzone-hint" id={`${inputId}-hint`}>{hint}</div>}
      {files && files.length > 0 && (
        <div className="dropzone-files">
          {files.length === 1
            ? <><b>{files[0].name}</b> <span className="muted">({formatBytes(files[0].size)})</span></>
            : <><b>{files.length} dosya</b> <span className="muted">({formatBytes(files.reduce((s, f) => s + f.size, 0))})</span></>}
        </div>
      )}
    </div>
  );
}
