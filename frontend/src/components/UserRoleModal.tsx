import { useState } from 'react';
import { apiError, apiPatch } from '../api/client';
import { AdminUserRow, Role } from '../types';
import { Modal } from './Modal';

interface Props {
  user: AdminUserRow;
  onClose: () => void;
  onSaved: () => void;
}

/** Rol değişimi yapısal bir işlem — hedef role'ün profil satırı yoksa oluşturulur, bu yüzden ayrı bir form. */
export function UserRoleModal({ user, onClose, onSaved }: Props) {
  const [role, setRole] = useState<Role>(user.role === 'taxpayer' ? 'accountant' : 'taxpayer');
  const [companyTitle, setCompanyTitle] = useState('');
  const [vknTckn, setVknTckn] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await apiPatch(`/admin/users/${user.id}/role`, {
        role,
        ...(role === 'taxpayer' ? { companyTitle, vknTckn } : { displayTitle }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Rol Değiştir — ${user.fullName}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <p className="muted" style={{ marginTop: 0 }}>
          Kullanıcının mevcut rolü: <b>{user.role === 'taxpayer' ? 'Mükellef' : user.role === 'accountant' ? 'Mali Müşavir' : 'Admin'}</b>
        </p>
        <div className="field">
          <label>Yeni Rol</label>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {user.role !== 'taxpayer' && <option value="taxpayer">Mükellef</option>}
            {user.role !== 'accountant' && <option value="accountant">Mali Müşavir</option>}
            {user.role !== 'admin' && <option value="admin">Admin</option>}
          </select>
        </div>
        {role === 'taxpayer' && (
          <>
            <div className="field">
              <label>Firma Unvanı <span className="req">*</span></label>
              <input value={companyTitle} onChange={(e) => setCompanyTitle(e.target.value)} required maxLength={255} />
            </div>
            <div className="field">
              <label>VKN/TCKN <span className="req">*</span></label>
              <input value={vknTckn} onChange={(e) => setVknTckn(e.target.value)} required maxLength={11} />
            </div>
          </>
        )}
        {role === 'accountant' && (
          <div className="field">
            <label>Unvan <span className="req">*</span></label>
            <input value={displayTitle} onChange={(e) => setDisplayTitle(e.target.value)} required maxLength={255} />
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Rolü Değiştir'}</button>
        </div>
      </form>
    </Modal>
  );
}
