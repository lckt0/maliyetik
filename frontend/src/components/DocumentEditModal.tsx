import { useState } from 'react';
import { apiError, apiPatch } from '../api/client';
import { DocumentRow, DocumentType } from '../types';
import { MetadataFieldsEditor, coerceMetadata, metadataToFormValues } from './MetadataFields';
import { Modal } from './Modal';

interface Props {
  endpoint: '/documents' | '/company-documents';
  doc: DocumentRow;
  documentTypes: DocumentType[];
  onClose: () => void;
  onSaved: () => void;
}

export function DocumentEditModal({ endpoint, doc, documentTypes, onClose, onSaved }: Props) {
  const type = documentTypes.find((t) => t.id === doc.documentTypeId);
  const fields = type?.metadataSchema?.fields ?? [];

  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? '');
  const [meta, setMeta] = useState<Record<string, string>>(metadataToFormValues(fields, doc.metadata));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const missing = fields.filter((f) => f.required && !meta[f.key]);
    if (missing.length) return setError(`Zorunlu alan(lar) eksik: ${missing.map((m) => m.label).join(', ')}`);

    setBusy(true);
    try {
      await apiPatch(`${endpoint}/${doc.id}`, {
        title,
        description,
        metadata: JSON.stringify(coerceMetadata(fields, meta)),
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
    <Modal title={`Düzenle — ${type?.name ?? doc.title}`} onClose={onClose} width={680}>
      <form onSubmit={submit}>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Açıklama</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <MetadataFieldsEditor fields={fields} values={meta}
          onChange={(key, v) => setMeta((m) => ({ ...m, [key]: v }))} />
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </form>
    </Modal>
  );
}
