import { useEffect, useState } from 'react';
import { apiError, apiPost } from '../api/client';
import { AdminUserRow } from '../types';
import { Modal } from './Modal';

interface Props {
  user: AdminUserRow;
  onClose: () => void;
}

/** Admin için tek kullanımlık şifre sıfırlama bağlantısı üretir — e-posta göndermez, admin bağlantıyı kopyalayıp kendisi paylaşır. */
export function UserPasswordResetLinkModal({ user, onClose }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiPost<{ url: string }>(`/admin/users/${user.id}/password-reset-link`)
      .then((r) => setUrl(r.url))
      .catch((e) => setError(apiError(e)));
    // eslint-disable-next-line
  }, [user.id]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Panoya erişilemezse kullanıcı bağlantıyı elle seçip kopyalayabilir.
    }
  }

  return (
    <Modal title={`Şifre Sıfırlama Bağlantısı — ${user.fullName}`} onClose={onClose}>
      {error && <div className="alert error">{error}</div>}
      {!error && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            Bu bağlantı 2 saat geçerlidir ve yalnızca bir kez kullanılabilir. Kullanıcıya güvenli bir kanaldan
            iletin — bağlantıyı kullanan kişi yeni bir şifre belirleyebilir, sonrasında tüm oturumlar kapanır.
          </p>
          <div className="field">
            <label>Bağlantı</label>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <input value={url} readOnly onFocus={(e) => e.target.select()} placeholder="Oluşturuluyor…" />
              <button type="button" className="btn secondary" style={{ flexShrink: 0 }} disabled={!url} onClick={copy}>
                {copied ? 'Kopyalandı' : 'Kopyala'}
              </button>
            </div>
          </div>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}
