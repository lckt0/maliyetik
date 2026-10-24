import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { homePathFor, useAuth } from '../auth';
import { useDocumentTypes } from '../hooks';
import { api } from '../api/client';
import { DocumentsTable } from '../components/DocumentsTable';
import { compressImage } from '../utils/imageCompress';
import { useStartBatchUpload, useUploadJob } from '../uploadManager';
import { generateReceiptGroupNo } from '../utils/receiptGroup';
import { WizardPanel, WizardSteps } from '../components/WizardSteps';

const STEPS = [
  { label: 'Tür Seç', hint: 'Evrak türü ve (opsiyonel) başlık' },
  { label: 'Dosya Seç', hint: 'Bir veya birden fazla dosya' },
  { label: 'Kaydet', hint: 'Özet, ilerleme ve sonuç' },
];

/**
 * Evrak Kayıt — henüz dijitalleştirilmemiş (özellikleri girilmemiş) evraklar için hızlı
 * kayıt: yalnızca tür seçilir, dosya yüklenir. Alanlar sonradan Evrak Dijitalleştir
 * sayfasında sırayla doldurulur.
 *
 * Yükleme, `uploadManager` üzerinden arka planda (component ömründen bağımsız) yürütülür —
 * kullanıcı yükleme sürerken başka bir sayfaya geçse bile devam eder; ilerleme hem burada
 * hem bildirim zilinde görünür.
 */
export function QuickUpload() {
  const { user, activeTaxpayerId } = useAuth();
  const documentTypes = useDocumentTypes();
  const types = useMemo(() => documentTypes.filter((t) => t.category !== 'company'), [documentTypes]);

  const [typeId, setTypeId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [compressing, setCompressing] = useState(false);
  const job = useUploadJob();
  const startBatchUpload = useStartBatchUpload();
  const busy = job?.status === 'running';
  const handledJobIdRef = useRef<string | null>(null);
  // İş bitince sonuç listesi ekranda KALSIN — yoksa yükleme biter bitmez adım geri
  // düşüyor ve kullanıcı hangi dosyanın kaydedildiğini göremeden ekran değişiyordu.
  const [showResult, setShowResult] = useState(false);

  // İş biter bitmez (başarılı/başarısız) kuyruk tablosunu ve mesajı güncelle — bu, sayfadan
  // ayrılıp geri dönüldüğünde de çalışır çünkü `job` global store'dan okunuyor.
  useEffect(() => {
    if (!job || job.status === 'running' || handledJobIdRef.current === job.id) return;
    handledJobIdRef.current = job.id;
    setRefreshKey((k) => k + 1);
    setShowResult(true);
    if (job.failed === 0) {
      setMsg({ kind: 'success', text: `${job.completed} evrak kaydedildi. Alanlarını Evrak Dijitalleştir sayfasından doldurabilirsiniz.` });
      return;
    }
    // Genel "kontrol edip tekrar deneyin" yerine asıl nedeni göster (ör. "bu dosya zaten
    // yüklenmiş") — aşağıdaki dosya listesi de (artık `busy` bitse bile) aynı nedeni satır
    // satır gösterir, ama üstteki özet mesaj tek bakışta yeterli olsun diye burada da tekrarlanır.
    const failedDetails = job.files
      .filter((f) => f.status === 'error')
      .map((f) => `${f.title || f.name}: ${f.error || 'Bilinmeyen hata'}`)
      .join(' • ');
    setMsg({
      kind: 'error',
      text: `${job.completed - job.failed} evrak kaydedildi, ${job.failed} evrak kaydedilemedi. ${failedDetails}`,
    });
  }, [job]);

  if (!user) return null;

  if (user.role === 'accountant' && !activeTaxpayerId) {
    return (
      <div className="card">
        <p>Evrak kaydetmek için önce bir mükellef seçin.</p>
        <Link className="btn" to="/musavir/mukellefler">Mükelleflerime Git</Link>
      </div>
    );
  }

  async function pickFiles(fileList: FileList | null) {
    setMsg(null);
    const picked = fileList ? Array.from(fileList) : [];
    if (!picked.length) { setPickedFiles([]); return; }
    setCompressing(true);
    const compressed: File[] = [];
    for (const f of picked) {
      compressed.push(await compressImage(f));
    }
    setPickedFiles(compressed);
    setCompressing(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!activeTaxpayerId) return setMsg({ kind: 'error', text: 'Mükellef bağlamı yok. Lütfen bir mükellef seçin.' });
    if (!typeId) return setMsg({ kind: 'error', text: 'Evrak türü seçin.' });
    if (!pickedFiles.length) return setMsg({ kind: 'error', text: 'Dosya seçin.' });

    const taxpayerId = activeTaxpayerId;
    const baseTitle = title.trim();
    const titles = pickedFiles.map((_, i) => (baseTitle ? (pickedFiles.length > 1 ? `${baseTitle} (${i + 1})` : baseTitle) : undefined));
    // Toplu yüklenen Z-Raporu'ları aynı Fiş Grubu'na düşürmek için tüm dosyalar aynı
    // rastgele grup no'yu paylaşır — dijitalleştirme sırasında elle girmeye gerek kalmaz.
    const selectedType = types.find((t) => t.id === typeId);
    const groupNo = selectedType?.code === 'z_raporu' ? generateReceiptGroupNo() : null;

    startBatchUpload({
      label: `${pickedFiles.length} evrak yükleniyor (Evrak Kayıt)`,
      files: pickedFiles,
      titles,
      upload: async (file, onProgress, index) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('documentTypeId', String(typeId));
        fd.append('taxpayerId', taxpayerId);
        fd.append('quick', 'true');
        if (titles[index]) fd.append('title', titles[index] as string);
        if (groupNo) fd.append('metadata', JSON.stringify({ receiptGroupNo: groupNo }));
        fd.append('source', 'web_quick');
        await api.post('/documents', fd, {
          onUploadProgress: (evt) => {
            if (evt.total) onProgress(Math.round((evt.loaded / evt.total) * 100));
          },
        });
      },
    });

    setPickedFiles([]);
    setTitle('');
    const input = document.getElementById('quick-file-input') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  // Adım durumdan TÜRETİLİR — ayrı bir adım state'i tutulmuyor ki geri/ileri ile
  // gerçek form durumu ayrışmasın (Toplu ZIP ekranıyla aynı yaklaşım).
  const step = busy || showResult ? 2 : !typeId ? 0 : pickedFiles.length === 0 ? 1 : 2;
  const selectedTypeName = types.find((t) => t.id === typeId)?.name ?? '';

  function resetFiles() {
    setPickedFiles([]);
    setShowResult(false);
    const input = document.getElementById('quick-file-input') as HTMLInputElement | null;
    if (input) input.value = '';
  }

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Henüz dijitalleştirilmemiş kağıt/eski evraklarınızı hızlıca sisteme kaydedin — yalnızca tür seçip dosyayı
        yükleyin. Belge no, tutar gibi alanları daha sonra{' '}
        <Link to={`${homePathFor(user.role)}/dijitallestir`}>Evrak Dijitalleştir</Link> sayfasından sırayla doldurabilirsiniz.
      </p>

      <WizardSteps steps={STEPS} current={step} />
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      <form onSubmit={submit}>
        {step === 0 && (
          <WizardPanel title="1. Evrak türünü seçin">
            <div className="field">
              <label>Evrak Türü <span className="req">*</span></label>
              <select value={typeId} required autoFocus
                onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— Seçin —</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <span className="hint">Seçtiğiniz tür, bu adımda yüklenecek tüm dosyalara uygulanır.</span>
            </div>

            <div className="field">
              <label>Başlık (opsiyonel)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Boş bırakılırsa dosya adından oluşturulur" />
              <span className="hint">Birden fazla dosya seçtiyseniz her evrağa "{'{başlık} (1)'}", "{'{başlık} (2)'}" şeklinde eklenir.</span>
            </div>
          </WizardPanel>
        )}

        {step === 1 && (
          <WizardPanel title="2. Dosyaları seçin"
            actions={<button type="button" className="btn secondary" onClick={() => setTypeId('')}>Geri</button>}>
            <p className="hint" style={{ marginTop: 0 }}>
              Tür: <strong>{selectedTypeName}</strong>{title.trim() && <> · Başlık: <strong>{title.trim()}</strong></>}
            </p>
            <div className="field">
              <label>Dosya(lar) <span className="req">*</span></label>
              <input id="quick-file-input" type="file" multiple required
                onChange={(e) => pickFiles(e.target.files)} />
              {compressing && <span className="hint">Sıkıştırılıyor…</span>}
              <span className="hint">Birden fazla dosya seçebilirsiniz — hepsi seçilen türle kaydedilir.</span>
            </div>
          </WizardPanel>
        )}

        {step === 2 && (
          <WizardPanel title="3. Kaydedin"
            actions={showResult ? (
              <button type="button" className="btn" onClick={() => { resetFiles(); setMsg(null); }}>
                Yeni Kayıt
              </button>
            ) : (
              <>
                {!busy && (
                  <button type="button" className="btn secondary" onClick={resetFiles}>Geri</button>
                )}
                <button className="btn" disabled={busy || compressing}>
                  {busy ? 'Kaydediliyor…' : pickedFiles.length > 1 ? `${pickedFiles.length} Evrağı Kaydet` : 'Evrağı Kaydet'}
                </button>
              </>
            )}>
            <p className="hint" style={{ marginTop: 0 }}>
              Tür: <strong>{selectedTypeName}</strong> · <strong>{pickedFiles.length || job?.files.length || 0}</strong> dosya
            </p>

            {!busy && pickedFiles.length > 0 && (
              <ul className="quick-upload-file-list">
                {pickedFiles.map((f, i) => (
                  <li key={i} className="quick-upload-file">
                    <span className="quick-upload-file-name">
                      {title.trim() ? (pickedFiles.length > 1 ? `${title.trim()} (${i + 1})` : title.trim()) : f.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {job && (
              <>
                <ul className="quick-upload-file-list">
                  {job.files.map((f, i) => (
                    <li key={i} className={`quick-upload-file quick-upload-file-${f.status}`}>
                      <span className="quick-upload-file-name">{f.title || f.name}</span>
                      <span className="quick-upload-file-status">
                        {f.status === 'pending' && 'Bekliyor'}
                        {f.status === 'uploading' && 'Yükleniyor…'}
                        {f.status === 'done' && 'Kaydedildi'}
                        {f.status === 'error' && (f.error || 'Hata')}
                      </span>
                    </li>
                  ))}
                </ul>
                {busy && (
                  <>
                    <div className="upload-progress">
                      <div className="upload-progress-bar"><div className="upload-progress-fill" style={{ width: `${job.percent}%` }} /></div>
                      <span className="upload-progress-pct">%{job.percent}</span>
                    </div>
                    <p className="hint" style={{ marginTop: 0 }}>
                      Yükleme arka planda devam eder — başka bir sayfaya geçebilirsiniz, ilerlemeyi bildirim zilinden de takip edebilirsiniz.
                    </p>
                  </>
                )}
              </>
            )}
          </WizardPanel>
        )}
      </form>

      <div className="queue-list-section">
        <h3>Dijitalleştirme Bekleyen Evraklar</h3>
        <DocumentsTable endpoint="/documents" documentTypes={documentTypes}
          fixedFilters={{ isDigitized: false }} refreshKey={refreshKey} />
      </div>
    </>
  );
}
