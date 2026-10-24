import { ReactNode, useEffect, useRef } from 'react';

interface SheetProps {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Alttan açılan diyalog — mobilde ortada duran bir modaldan hem daha tanıdık hem de
 * başparmakla ulaşılabilir. "Tek belge / Çoklu belge" seçimi ve onay soruları kullanır.
 *
 * Erişilebilirlik: açılışta odak içeri alınır, Escape ve arka plana dokunma kapatır,
 * odak diyalogun içinde döner (arkadaki sayfaya sekmeyle kaçılamaz).
 */
export function Sheet({ title, description, onClose, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button, [href], input, select')?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown);
    // Arkadaki liste kaymasın
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <div ref={panel} className="m-sheet" role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-grip" aria-hidden="true" />
        <div className="m-sheet-title">{title}</div>
        {description && <p className="m-hint" style={{ margin: '0 0 1rem' }}>{description}</p>}
        {children}
      </div>
    </div>
  );
}

interface ConfirmSheetProps {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmSheet({ title, description, confirmLabel, danger, busy, onConfirm, onClose }: ConfirmSheetProps) {
  return (
    <Sheet title={title} description={description} onClose={onClose}>
      <div className="m-btn-row">
        <button type="button" className="m-btn secondary" disabled={busy} onClick={onClose}>Vazgeç</button>
        <button type="button" className={`m-btn ${danger ? 'danger' : ''}`} disabled={busy} onClick={onConfirm}>
          {busy ? <span className="m-spinner" /> : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
