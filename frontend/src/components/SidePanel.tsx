import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from './Icons';

/** Pencerenin sağında açılan, üstünde kapatma çarpısı olan kayan panel (evrak önizlemesi vb. için). */
export function SidePanel({ title, onClose, children, width = 480 }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="side-panel-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="side-panel" style={{ width }}>
        <div className="side-panel-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kapat"><XIcon /></button>
        </div>
        <div className="side-panel-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
