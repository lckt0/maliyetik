import { useState } from 'react';
import { apiError, apiPatch } from '../api/client';
import { Announcement } from '../types';
import { Modal } from './Modal';

interface Props {
  announcement: Announcement;
  onClose: () => void;
  onSaved: (updated: Announcement) => void;
}

export function AnnouncementEditModal({ announcement, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(announcement.title);
  const [body, setBody] = useState(announcement.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const updated = await apiPatch<Announcement>(`/admin/announcements/${announcement.id}`, { title, body });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Duyuruyu Düzenle" onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={255} />
        </div>
        <div className="field">
          <label>Mesaj</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={4} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Modal>
  );
}
