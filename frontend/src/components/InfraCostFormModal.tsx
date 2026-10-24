import { useState } from 'react';
import { apiError, apiPatch, apiPost } from '../api/client';
import { Modal } from './Modal';
import { InfraCostBillingCycle, InfraCostCategory, InfraCostRow } from '../types';
import { DateInput } from './DateInput';

const CATEGORY_LABELS: Record<InfraCostCategory, string> = {
  server: 'Sunucu', hosting: 'Hosting', database: 'Veritabanı', storage: 'Depolama',
  domain: 'Domain', email: 'E-posta', other: 'Diğer',
};

const CYCLE_LABELS: Record<InfraCostBillingCycle, string> = {
  monthly: 'Aylık', yearly: 'Yıllık', one_time: 'Tek Seferlik',
};

interface Props {
  existing?: InfraCostRow;
  onClose: () => void;
  onSaved: () => void;
}

export function InfraCostFormModal({ existing, onClose, onSaved }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<InfraCostCategory>(existing?.category ?? 'other');
  const [provider, setProvider] = useState(existing?.provider ?? '');
  const [amount, setAmount] = useState(existing?.amount ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? 'TRY');
  const [billingCycle, setBillingCycle] = useState<InfraCostBillingCycle>(existing?.billingCycle ?? 'monthly');
  const [nextBillingDate, setNextBillingDate] = useState(existing?.nextBillingDate?.slice(0, 10) ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    const body = {
      name, category, provider: provider || undefined, amount: Number(amount), currency,
      billingCycle, nextBillingDate: nextBillingDate || undefined, note: note || undefined,
    };
    try {
      if (existing) await apiPatch(`/admin/infra-costs/${existing.id}`, body);
      else await apiPost('/admin/infra-costs', body);
      onSaved();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={existing ? 'Maliyet Kaydını Düzenle' : 'Yeni Maliyet Kaydı'} onClose={onClose}>
      <form onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label>Ad <span className="req">*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} placeholder="ör. Google Cloud Storage" />
        </div>
        <div className="row">
          <div className="field">
            <label>Kategori <span className="req">*</span></label>
            <select value={category} onChange={(e) => setCategory(e.target.value as InfraCostCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Sağlayıcı</label>
            <input value={provider} onChange={(e) => setProvider(e.target.value)} maxLength={100} placeholder="ör. Google Cloud" />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Tutar <span className="req">*</span></label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div className="field">
            <label>Para Birimi</label>
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>Ödeme Periyodu <span className="req">*</span></label>
            <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as InfraCostBillingCycle)}>
              {Object.entries(CYCLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Sonraki Ödeme Tarihi</label>
            <DateInput value={nextBillingDate} onChange={setNextBillingDate} />
          </div>
        </div>
        <div className="field">
          <label>Not</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
      </form>
    </Modal>
  );
}
