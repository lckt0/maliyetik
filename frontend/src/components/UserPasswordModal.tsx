import { useState } from 'react';
import { apiError, apiPatch } from '../api/client';
import { AdminUserRow } from '../types';
import { Modal } from './Modal';

interface Props {
  user: AdminUserRow;
  onClose: () => void;
  onSaved: () => void;
}

/** Admin, kullanıcının şifresini doğrudan belirler — kaydedince kullanıcının tüm oturumları kapanır. */
export function UserPasswordModal({ user, onClose, onSaved }: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError('Şifreler eşleşmiyor.');
    setError(''); setBusy(true);
    try {
      await apiPatch(`/admin/users/${user.id}/password`, { password });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Şifre Değiştir — ${user.fullName}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <p className="muted" style={{ marginTop: 0 }}>
          Kaydettiğinizde kullanıcının açık tüm oturumları kapatılır, yeni şifresiyle tekrar giriş yapması gerekir.
        </p>
        <div className="field">
          <label>Yeni Şifre <span className="req">*</span></label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" />
        </div>
        <div className="field">
          <label>Yeni Şifre (Tekrar) <span className="req">*</span></label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} maxLength={72} autoComplete="new-password" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Şifreyi Değiştir'}</button>
        </div>
      </form>
    </Modal>
  );
}
