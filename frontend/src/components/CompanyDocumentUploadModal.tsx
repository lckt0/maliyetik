import { Modal } from './Modal';
import { UploadForm } from './UploadForm';
import { DocumentType } from '../types';

interface Props {
  type: DocumentType;
  taxpayerId: string | null;
  onClose: () => void;
  onUploaded: () => void;
}

/** UploadForm'u tek bir evrak türüne sabitleyerek modal içinde açar — "Şirket Evraklarım" kart tıklaması. */
export function CompanyDocumentUploadModal({ type, taxpayerId, onClose, onUploaded }: Props) {
  return (
    <Modal title={`${type.name} Yükle`} onClose={onClose}>
      <UploadForm
        documentTypes={[type]}
        taxpayerId={taxpayerId}
        endpoint="/company-documents"
        category="company"
        onSuccess={() => { onUploaded(); onClose(); }}
      />
    </Modal>
  );
}
