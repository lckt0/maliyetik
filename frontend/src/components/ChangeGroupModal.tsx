import { useState } from 'react';
import { apiError, apiPatch } from '../api/client';
import { useReceiptGroups } from '../hooks';
import { DocumentRow } from '../types';
import { Modal } from './Modal';

interface Props {
  doc: DocumentRow;
  taxpayerId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Evrak Kayıt kuyruğundaki (henüz dijitalleştirilmemiş) bir evrağın Fiş Grubu'nu değiştirir. */
export function ChangeGroupModal({ doc, taxpayerId, onClose, onSaved }: Props) {
  const [groupNo, setGroupNo] = useState((doc.metadata?.receiptGroupNo as string) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const groups = useReceiptGroups(doc.documentTypeId, taxpayerId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!groupNo.trim()) return setError('Fiş Grubu No girin.');
    setBusy(true);
    try {
      await apiPatch(`/documents/${doc.id}/receipt-group`, { groupNo: groupNo.trim() });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Fiş Grubu Değiştir — ${doc.title}`} onClose={onClose} width={420}>
      <form onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label>Fiş Grubu No</label>
          <input list="change-group-options" value={groupNo} autoFocus
            onChange={(e) => setGroupNo(e.target.value)} />
          <datalist id="change-group-options">
            {groups.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Modal>
  );
}
