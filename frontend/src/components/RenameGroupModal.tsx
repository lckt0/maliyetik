import { useState } from 'react';
import { apiError, apiPatch } from '../api/client';
import { useReceiptGroups } from '../hooks';
import { Modal } from './Modal';

interface Props {
  documentTypeId: number;
  groupNo: string;
  taxpayerId: string | null;
  onClose: () => void;
  onSaved: (count: number, newGroupNo: string) => void;
}

/** Bir Fiş Grubu'ndaki TÜM evrakların Fiş Grup No'sunu tek seferde değiştirir. */
export function RenameGroupModal({ documentTypeId, groupNo, taxpayerId, onClose, onSaved }: Props) {
  const [newGroupNo, setNewGroupNo] = useState(groupNo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const groups = useReceiptGroups(documentTypeId, taxpayerId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!newGroupNo.trim()) return setError('Yeni Fiş Grubu No girin.');
    setBusy(true);
    try {
      const res = await apiPatch<{ count: number }>('/documents/group', { documentTypeId, groupNo, newGroupNo: newGroupNo.trim(), taxpayerId: taxpayerId ?? undefined });
      onSaved(res.count, newGroupNo.trim());
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Fiş Grubunu Yeniden Adlandır — ${groupNo}`} onClose={onClose} width={420}>
      <form onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <p className="hint" style={{ marginTop: 0 }}>Bu gruptaki tüm evrakların Fiş Grup No'su tek seferde değiştirilir.</p>
        <div className="field">
          <label>Yeni Fiş Grubu No</label>
          <input list="rename-group-options" value={newGroupNo} autoFocus
            onChange={(e) => setNewGroupNo(e.target.value)} />
          <datalist id="rename-group-options">
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
