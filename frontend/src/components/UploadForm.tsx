import { useEffect, useMemo, useState } from 'react';
import { api, apiError, apiPost } from '../api/client';
import { bumpData } from '../dataBus';
import { DocumentType, MetadataField, RecognizeResult } from '../types';
import { MetadataFieldsEditor, coerceMetadata } from './MetadataFields';
import { compressImage } from '../utils/imageCompress';
import { WizardPanel, WizardSteps } from './WizardSteps';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STEPS = [
  { label: 'Dosya Seç', hint: 'Tek evrak (birden fazla seçilirse kuyruğa alınır)' },
  { label: 'Türü Onayla', hint: 'Otomatik tanınan türü kontrol edin' },
  { label: 'Alanları Doldur', hint: 'Başlık, açıklama ve evrak alanları' },
];

interface Props {
  documentTypes: DocumentType[];
  taxpayerId: string | null;
  endpoint: '/documents' | '/company-documents';
  category?: 'financial' | 'company' | 'other';
  onSuccess?: () => void;
  /**
   * Adımlı görünüm. Yalnızca Evrak Yükle sayfasında açık: aynı bileşen "Şirket Evrağı
   * Yükle" kipinde bir modal içinde de kullanılıyor ve orada üç adımlık şerit dar
   * pencerede yer israfı olurdu.
   */
  wizard?: boolean;
}

export function UploadForm({ documentTypes, taxpayerId, endpoint, category, onSuccess, wizard }: Props) {
  const types = useMemo(
    () => documentTypes.filter((t) => (category ? t.category === category : t.category !== 'company')),
    [documentTypes, category],
  );
  const [typeId, setTypeId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [queueDoneCount, setQueueDoneCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognized, setRecognized] = useState<'none' | 'matched' | 'unmatched'>('none');
  // Yalnızca adımlı görünümde anlamlı: kullanıcı tanınan türü onaylayana kadar alan
  // formuna geçilmez. Yeni dosya yüklenince sıfırlanır.
  const [typeConfirmed, setTypeConfirmed] = useState(false);

  const selected = types.find((t) => t.id === typeId);
  const fields: MetadataField[] = selected?.metadataSchema?.fields ?? [];

  // Tek türe sabitlenmiş formlarda (ör. "Şirket Evraklarım" kart tıklaması) kullanıcı
  // tekrar seçim yapmak zorunda kalmasın diye tek seçenek otomatik seçilir.
  useEffect(() => {
    if (types.length === 1 && typeId === '') setTypeId(types[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types]);

  function pickType(id: number | '') {
    setTypeId(id);
    setMeta({});
    setMsg(null);
    setRecognized('none');
  }

  async function loadFile(rawFile: File) {
    setRecognized('none');
    setTypeConfirmed(false);
    setTitle('');
    setDescription('');
    setMeta({});

    // Küçültülmüş/yeniden kodlanmış dosya hem burada (tanıma) hem de son gönderimde
    // kullanılır — evrak fotoğrafları genelde çok büyük, yükleme süresini kısaltır.
    const f = await compressImage(rawFile);
    setFile(f);

    setRecognizing(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      if (taxpayerId) fd.append('taxpayerId', taxpayerId);
      const result = await apiPost<RecognizeResult>('/documents/recognize', fd);
      const match = result.matched ? types.find((t) => t.id === result.documentTypeId) : undefined;
      if (match) {
        setTypeId(match.id);
        setMeta(result.metadata ?? {});
        if (result.title) setTitle(result.title);
        setRecognized('matched');
      } else {
        setRecognized('unmatched');
      }
    } catch {
      setRecognized('unmatched');
    } finally {
      setRecognizing(false);
    }
  }

  /** Dosya seçici `multiple` — ilk dosya hemen işlenir, kalanı kuyruğa alınır ve her
   * başarılı kayıttan sonra otomatik olarak sıradaki yüklenir. */
  async function pickFiles(fileList: FileList | null) {
    setMsg(null);
    const picked = fileList ? Array.from(fileList) : [];
    if (!picked.length) { setFile(null); setQueue([]); return; }
    const [first, ...rest] = picked;
    setQueue(rest);
    setQueueDoneCount(0);
    await loadFile(first);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!taxpayerId) return setMsg({ kind: 'error', text: 'Mükellef bağlamı yok. Lütfen bir mükellef seçin.' });
    if (!file) return setMsg({ kind: 'error', text: 'Dosya seçin.' });

    if (selected) {
      const missing = fields.filter((f) => f.required && !meta[f.key]);
      if (missing.length) return setMsg({ kind: 'error', text: `Zorunlu alan(lar) eksik: ${missing.map((m) => m.label).join(', ')}` });
    }

    const fd = new FormData();
    fd.append('file', file);
    if (selected) fd.append('documentTypeId', String(selected.id));
    fd.append('taxpayerId', taxpayerId);
    if (title || selected) fd.append('title', title || selected!.name);
    if (description) fd.append('description', description);
    if (selected) fd.append('metadata', JSON.stringify(coerceMetadata(fields, meta)));
    // Ölçüm etiketi yalnızca evrak ucuna gider; şirket dokümanları ucu bu alanı tanımıyor.
    if (endpoint === '/documents') fd.append('source', 'web_form');

    setBusy(true);
    setProgress(0);
    try {
      await api.post(endpoint, fd, {
        onUploadProgress: (evt) => {
          if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
        },
      });
      // Açık olan evrak listeleri ve kota göstergeleri anında tazelensin.
      bumpData(endpoint === '/company-documents' ? 'company-documents' : 'documents', 'quota');
      onSuccess?.();

      if (queue.length > 0) {
        const [next, ...rest] = queue;
        setQueue(rest);
        setQueueDoneCount((c) => c + 1);
        setMsg({ kind: 'success', text: 'Evrak başarıyla yüklendi. Sıradaki dosya yükleniyor…' });
        await loadFile(next);
      } else {
        setMsg({ kind: 'success', text: queueDoneCount > 0 ? `${queueDoneCount + 1} evrak başarıyla yüklendi.` : 'Evrak başarıyla yüklendi.' });
        setTitle(''); setDescription(''); setMeta({}); setFile(null); setRecognized('none');
        setTypeConfirmed(false);
        setQueueDoneCount(0);
        const input = document.getElementById('file-input') as HTMLInputElement | null;
        if (input) input.value = '';
      }
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const fileTypeMismatch = !!(selected?.metadataSchema?.fileAccept === 'image/*' && file && !file.type.startsWith('image/'));

  // Adım durumdan türetilir; ayrı bir "hangi adımdayım" state'i tutulmuyor.
  const step = !file ? 0 : !typeConfirmed ? 1 : 2;
  const show = (n: number) => !wizard || step === n;

  const fileSection = (
    <>
      <div className="field">
        <label>Dosya <span className="req">*</span></label>
        <input id="file-input" type="file" multiple required
          onChange={(e) => pickFiles(e.target.files)} />
        {file && <span className="hint">{formatFileSize(file.size)}</span>}
        {queue.length > 0 && (
          <span className="hint">
            Bu dosyadan sonra kuyrukta <b>{queue.length}</b> dosya daha var — her kayıttan sonra sıradaki otomatik açılır.
          </span>
        )}
      </div>

      {queue.length > 0 && (
        <ul className="upload-queue-list">
          {queue.map((q, i) => (
            <li key={i} className="upload-queue-item">
              <span className="upload-queue-item-name">{q.name}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const typeSection = (
    <>
      {recognizing && <span className="hint">Evrak taranıyor, tür ve alanlar tanınmaya çalışılıyor…</span>}
      {!recognizing && recognized === 'matched' && selected && (
        <div className="alert success">
          Evrak türü otomatik tanındı: <strong>{selected.name}</strong>. Alanları kontrol edip kaydedebilirsiniz.
        </div>
      )}
      {!recognizing && recognized === 'unmatched' && (
        <div className="alert warning">Evrak türü otomatik tanınamadı. Lütfen aşağıdan manuel seçin.</div>
      )}

      <div className="field">
        <label>Evrak Türü</label>
        <select value={typeId} onChange={(e) => pickType(e.target.value ? Number(e.target.value) : '')}>
          <option value="">— Belirtilmedi —</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {!selected && <span className="hint">Tür belirtilmezse evrak "Belirtilmedi" olarak kaydedilir, alanları sonra doldurabilirsiniz.</span>}
      </div>
    </>
  );

  const detailSection = file ? (
    <>
      {fileTypeMismatch && (
        <div className="alert error">Bu evrak türü için yalnızca görsel dosyası (jpg, png vb.) kabul edilir. Lütfen dosyayı değiştirin.</div>
      )}

      <div className="field">
        <label>Başlık</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={selected?.name} />
      </div>
      <div className="field">
        <label>Açıklama</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {selected && (
        <MetadataFieldsEditor fields={fields} values={meta}
          onChange={(key, v) => setMeta((m) => ({ ...m, [key]: v }))} />
      )}

      {progress !== null && (
        <div className="upload-progress">
          <div className="upload-progress-bar"><div className="upload-progress-fill" style={{ width: `${progress}%` }} /></div>
          <span className="upload-progress-pct">%{progress}</span>
        </div>
      )}
    </>
  ) : null;

  const submitButton = (
    <button className="btn" disabled={busy || fileTypeMismatch}>
      {busy ? 'Yükleniyor…' : queue.length > 0 ? `Kaydet ve Sıradakine Geç (${queue.length} kaldı)` : 'Evrağı Yükle'}
    </button>
  );

  if (!wizard) {
    return (
      <form className="card" onSubmit={submit} style={{ maxWidth: 640 }}>
        {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
        {fileSection}
        {typeSection}
        {file && <>{detailSection}{submitButton}</>}
      </form>
    );
  }

  return (
    <>
      <WizardSteps steps={STEPS} current={step} />
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <form onSubmit={submit}>
        {show(0) && (
          <WizardPanel title="1. Dosyayı seçin">{fileSection}</WizardPanel>
        )}
        {show(1) && (
          <WizardPanel title="2. Evrak türünü onaylayın"
            actions={
              <>
                <button type="button" className="btn secondary" onClick={() => pickFiles(null)}>Geri</button>
                <button type="button" className="btn" disabled={recognizing}
                  onClick={() => setTypeConfirmed(true)}>
                  {recognizing ? 'Taranıyor…' : 'Devam'}
                </button>
              </>
            }>
            {typeSection}
          </WizardPanel>
        )}
        {show(2) && (
          <WizardPanel title="3. Alanları doldurun ve kaydedin"
            actions={
              <>
                <button type="button" className="btn secondary" disabled={busy}
                  onClick={() => setTypeConfirmed(false)}>Geri</button>
                {submitButton}
              </>
            }>
            {detailSection}
          </WizardPanel>
        )}
      </form>
    </>
  );
}
