import { Modal } from './Modal';
import { TaxpayerQuotaPanel } from './TaxpayerQuotaPanel';

interface Props {
  taxpayerId: string;
  companyTitle: string;
  onClose: () => void;
}

/** Mükelleflerim satırından hızlı bakış — bkz. `TaxpayerQuotaPanel`. */
export function TaxpayerQuotaModal({ taxpayerId, companyTitle, onClose }: Props) {
  return (
    <Modal title={`Kota / AI Kredi — ${companyTitle}`} onClose={onClose} width={640}>
      <TaxpayerQuotaPanel taxpayerId={taxpayerId} />
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}
