import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { Modal } from './Modal';

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface AlertOptions {
  title?: string;
  okLabel?: string;
}

interface DialogCtx {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  alert: (message: string, options?: AlertOptions) => Promise<void>;
}

type Request =
  | { kind: 'confirm'; message: string; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; message: string; options: AlertOptions; resolve: () => void };

const Ctx = createContext<DialogCtx | null>(null);

/**
 * `window.confirm`/`window.alert` yerine geçen, uygulamanın kendi `Modal` bileşenini kullanan
 * promise tabanlı diyalog sistemi. Tüm panel/sayfa kodları bu hook üzerinden çağırır — tarayıcının
 * yerel (stilsiz, engelleyici) diyaloglarına asla düşülmez.
 */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => (
    new Promise<boolean>((resolve) => {
      setRequest({ kind: 'confirm', message, options, resolve });
    })
  ), []);

  const alertFn = useCallback((message: string, options: AlertOptions = {}) => (
    new Promise<void>((resolve) => {
      setRequest({ kind: 'alert', message, options, resolve });
    })
  ), []);

  const value = useMemo<DialogCtx>(() => ({ confirm, alert: alertFn }), [confirm, alertFn]);

  function close(result: boolean) {
    if (!request) return;
    if (request.kind === 'confirm') request.resolve(result);
    else request.resolve();
    setRequest(null);
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      {request && (
        <Modal
          title={request.options.title ?? (request.kind === 'confirm' ? 'Onay Gerekiyor' : 'Bilgi')}
          onClose={() => close(false)}
          width={420}
        >
          <p className="dialog-message">{request.message}</p>
          <div className="modal-actions">
            {request.kind === 'confirm' ? (
              <>
                <button type="button" className="btn secondary" onClick={() => close(false)}>
                  {request.options.cancelLabel ?? 'Vazgeç'}
                </button>
                <button
                  type="button"
                  className={`btn ${request.options.danger ? 'danger' : ''}`}
                  onClick={() => close(true)}
                  autoFocus
                >
                  {request.options.confirmLabel ?? 'Onayla'}
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => close(true)} autoFocus>
                {request.options.okLabel ?? 'Tamam'}
              </button>
            )}
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function useDialog(): DialogCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDialog, DialogProvider dışında çağrıldı.');
  return ctx;
}
