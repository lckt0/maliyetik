import { useState } from 'react';
import { apiError, apiPost } from '../api/client';
import { useMyTaxpayers } from '../taxpayers';
import { Modal } from './Modal';
import { BellIcon } from './Icons';
import { taxpayerColor } from '../utils/taxpayerColor';

interface Props {
  /** Modal açıldığında önceden işaretli gelecek mükellef (satırdan açılınca). */
  initialTaxpayerId?: string | null;
  onClose: () => void;
}

interface NotifyResult { sent: number; emailed: number; skipped: string[] }

/**
 * Müşavir → mükellef mesajı. Mesaj mükellefin panelinde zil bildirimi olarak düşer;
 * "e-posta olarak da gönder" işaretlenirse ayrıca e-posta gider (mükellef e-posta
 * bildirimlerini kapattıysa e-posta atlanır, bildirim yine düşer).
 *
 * Alıcı listesi sunucuda aktif yetkilerle yeniden kesiştirilir — buradaki seçim
 * yalnızca kolaylık, yetki kaynağı değil.
 */
export function NotifyTaxpayersModal({ initialTaxpayerId, onClose }: Props) {
  const { active } = useMyTaxpayers();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialTaxpayerId ? [initialTaxpayerId] : []),
  );
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<NotifyResult | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!selected.size || !title.trim() || !body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiPost<NotifyResult>('/accountants/notify', {
        taxpayerIds: [...selected],
        title: title.trim(),
        body: body.trim(),
        sendEmail,
      });
      setResult(res);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Mükellefe Bildirim Gönder" onClose={onClose}>
      {result ? (
        <>
          <div className="alert success">
            {result.sent} mükellefe bildirim gönderildi
            {result.emailed > 0 && `, ${result.emailed} tanesine e-posta da iletildi`}.
            {result.skipped.length > 0 && ` ${result.skipped.length} mükellef yetkiniz olmadığı için atlandı.`}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Kapat</button>
          </div>
        </>
      ) : (
        <>
          {error && <div className="alert error">{error}</div>}

          <div className="field">
            <label>Alıcılar <span className="muted">({selected.size} seçili)</span></label>
            <div className="notify-recipients thin-scroll">
              {active.length === 0 && <p className="muted" style={{ margin: 0 }}>Aktif mükellefiniz yok.</p>}
              {active.map((a) => (
                <label key={a.id} className="notify-recipient">
                  <input type="checkbox" checked={selected.has(a.taxpayerId)}
                    onChange={() => toggle(a.taxpayerId)} />
                  <span className="tp-dot" style={{ background: taxpayerColor(a.taxpayerId) ?? undefined }} aria-hidden="true" />
                  <span className="notify-recipient-name">{a.taxpayer?.companyTitle}</span>
                  <span className="muted">{a.taxpayer?.vknTckn}</span>
                </label>
              ))}
            </div>
            {active.length > 1 && (
              <div className="note-quick-row" style={{ marginTop: '.4rem' }}>
                <button type="button" className="btn sm secondary"
                  onClick={() => setSelected(new Set(active.map((a) => a.taxpayerId)))}>Tümünü Seç</button>
                <button type="button" className="btn sm secondary"
                  onClick={() => setSelected(new Set())}>Seçimi Kaldır</button>
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="notify-title">Konu</label>
            <input id="notify-title" value={title} maxLength={120}
              onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Temmuz evraklarınız eksik" />
          </div>

          <div className="field">
            <label htmlFor="notify-body">Mesaj</label>
            <textarea id="notify-body" rows={5} value={body} maxLength={2000}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Mükellefinize iletmek istediğiniz mesaj…" />
            <p className="hint">{body.length} / 2000</p>
          </div>

          <label className="checkbox-field">
            <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
            E-posta olarak da gönder
          </label>
          <p className="hint">
            E-posta bildirimlerini kapatmış mükelleflere e-posta gitmez; panel bildirimi her durumda düşer.
          </p>

          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>Vazgeç</button>
            <button type="button" className="btn" disabled={busy || !selected.size || !title.trim() || !body.trim()}
              onClick={() => void send()}>
              <BellIcon /> {busy ? 'Gönderiliyor…' : `Gönder (${selected.size})`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
