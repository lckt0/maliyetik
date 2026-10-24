import { ReactNode } from 'react';

export interface WizardStep {
  /** Adım başlığı — "Dosya Seç" gibi kısa bir eylem. */
  label: string;
  /** Adımın altındaki tek satırlık açıklama (opsiyonel). */
  hint?: string;
}

/**
 * Çok adımlı akışların (Luca içe aktarma, toplu ZIP, çoklu fatura PDF) üst şeridi.
 * Kullanıcı hangi adımda olduğunu ve daha kaç adım kaldığını ilk bakışta görsün diye
 * eklendi — öncesinde sayfalar sırasız kart yığınıydı ve işlem sırası belli değildi.
 */
export function WizardSteps({ steps, current }: { steps: WizardStep[]; current: number }) {
  return (
    <ol className="wizard-steps">
      {steps.map((s, i) => (
        <li key={s.label} className={`wizard-step ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`}>
          <span className="wizard-step-no">{i < current ? '✓' : i + 1}</span>
          <span className="wizard-step-text">
            <b>{s.label}</b>
            {s.hint && <span className="wizard-step-hint">{s.hint}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Adım gövdesi — başlık + içerik; adımlar arasında görsel tutarlılık için. */
export function WizardPanel({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="card wizard-panel">
      {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
      {children}
      {actions && <div className="wizard-actions">{actions}</div>}
    </div>
  );
}
