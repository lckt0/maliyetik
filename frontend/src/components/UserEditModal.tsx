import { useState } from 'react';
import { apiError, apiPatch } from '../api/client';
import { AdminUserRow } from '../types';
import { Modal } from './Modal';

interface Props {
  user: AdminUserRow;
  onClose: () => void;
  onSaved: () => void;
}

export function UserEditModal({ user, onClose, onSaved }: Props) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [vknTckn, setVknTckn] = useState(user.vknTckn ?? '');
  const [companyTitle, setCompanyTitle] = useState(user.companyTitle ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await apiPatch(`/admin/users/${user.id}`, {
        fullName, email, phone: phone || undefined,
        vknTckn: user.role === 'taxpayer' ? (vknTckn.trim() || undefined) : undefined,
        companyTitle: user.role === 'taxpayer' ? (companyTitle.trim() || undefined) : undefined,
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
    <Modal title={`Kullanıcıyı Düzenle — ${user.fullName}`} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label>Ad Soyad</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={150} />
        </div>
        <div className="field">
          <label>E-posta</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Telefon</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
        </div>
        {user.role === 'taxpayer' && (
          <>
            <div className="field">
              <label>Şirket Unvanı</label>
              <input value={companyTitle} onChange={(e) => setCompanyTitle(e.target.value)} maxLength={255} />
            </div>
            <div className="field">
              <label>VKN/TCKN</label>
              <input value={vknTckn} onChange={(e) => setVknTckn(e.target.value)} maxLength={11}
                placeholder="10 veya 11 haneli" />
            </div>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Modal>
  );
}
