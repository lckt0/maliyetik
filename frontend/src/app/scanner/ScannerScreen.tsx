import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useDocumentTypes } from '../../hooks';
import { AlertCircleIcon, CameraIcon, LayersIcon, TrashIcon, XIcon } from '../../components/Icons';
import { ArrowLeftIcon, CheckIcon, CropIcon, FlashIcon, FlashOffIcon, RetakeIcon } from '../icons';
import { CAMERA_ERROR_TEXT, useCamera } from './CameraView';
import { CropEditor } from './CropEditor';
import { defaultQuad, Quad } from './geometry';
import { enhanceContrast, warpToRect } from './warp';
import { detectDocument } from './detectDocument';
import { imageDataToJpeg, saveScannedPages } from './captureUpload';

interface Page {
  id: number;
  /** Ham çekim — köşeler yeniden düzenlenirse buradan tekrar işlenir. */
  source: ImageData;
  quad: Quad;
  /** İşlenmiş (düzeltilmiş + kontrastlanmış) küçük önizleme URL'i. */
  previewUrl: string;
  processed: ImageData;
}

type Stage = 'camera' | 'crop' | 'review';

export function ScannerScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, activeTaxpayerId } = useAuth();
  const documentTypes = useDocumentTypes();

  const typeId = Number(params.get('type'));
  const multi = params.get('mode') === 'multi';
  const type = documentTypes.find((t) => t.id === typeId);

  const camera = useCamera();
  const [stage, setStage] = useState<Stage>('camera');
  const [pages, setPages] = useState<Page[]>([]);
  const [draft, setDraft] = useState<
    { source: ImageData; quad: Quad; replacingId: number | null; autoDetected: boolean } | null
  >(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const nextId = useRef(1);

  // Önizleme object URL'leri bileşen kapanırken serbest bırakılır — aksi halde her
  // taramada birkaç MB bellek sızar.
  //
  // Temizleme SADECE unmount'ta çalışmalı. Effect `pages`'e bağlanırsa React, liste her
  // değiştiğinde önceki temizlemeyi çalıştırır ve hâlâ ekranda duran sayfaların URL'lerini
  // iptal eder — ikinci sayfa eklendiği anda birincinin önizlemesi kırık görsele dönüyordu.
  // Güncel liste ref üzerinden okunur; tek tek silme/değiştirme zaten kendi yerinde iptal eder.
  const pagesRef = useRef<Page[]>([]);
  useEffect(() => { pagesRef.current = pages; }, [pages]);
  useEffect(() => () => { pagesRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)); }, []);

  const buildPage = useCallback(async (id: number, source: ImageData, quad: Quad): Promise<Page> => {
    const warped = warpToRect(source, quad);
    // Dörtgen dejenereyse (üç köşe aynı doğruda) düzeltme yapılamaz — ham kare kullanılır.
    const processed = enhanceContrast(warped ?? source);
    const file = await imageDataToJpeg(processed, `sayfa-${id}.jpg`);
    return { id, source, quad, processed, previewUrl: URL.createObjectURL(file) };
  }, []);

  async function shoot() {
    setError('');
    // İlk kare, video henüz ilk görüntüsünü çizmemişken (videoWidth = 0) boş dönebilir;
    // kullanıcıya hata göstermeden önce kısa bir kez daha denenir.
    let frame = camera.capture();
    if (!frame) {
      await new Promise((r) => setTimeout(r, 250));
      frame = camera.capture();
    }
    if (!frame) { setError('Kare alınamadı, tekrar deneyin.'); return; }
    openCrop(frame, null);
  }

  function openCrop(source: ImageData, replacingId: number | null) {
    // Tespit emin olamadığında null döner — o zaman kadrajı kaplayan varsayılan dörtgen
    // gösterilir ve kullanıcı köşeleri kendisi yerleştirir.
    const detected = detectDocument(source);
    setDraft({
      source,
      quad: detected ?? defaultQuad(source.width, source.height),
      replacingId,
      autoDetected: Boolean(detected),
    });
    setStage('crop');
  }

  async function confirmCrop() {
    if (!draft) return;
    setBusy('İşleniyor…');
    try {
      const id = draft.replacingId ?? nextId.current++;
      const page = await buildPage(id, draft.source, draft.quad);
      setPages((prev) => {
        const existing = prev.findIndex((p) => p.id === id);
        if (existing === -1) return [...prev, page];
        URL.revokeObjectURL(prev[existing].previewUrl);
        const next = prev.slice();
        next[existing] = page;
        return next;
      });
      setDraft(null);
      // Tekli modda tek sayfa yeter → doğrudan gözden geçirmeye; çoklu modda kamera açık kalır.
      setStage(multi && draft.replacingId === null ? 'camera' : 'review');
    } catch (e) {
      setError((e as Error).message || 'Görüntü işlenemedi.');
    } finally {
      setBusy('');
    }
  }

  /** Galeriden/native kameradan dosya seçme — getUserMedia çalışmadığında tek yedek. */
  async function pickFromFile(file: File) {
    setBusy('Açılıyor…');
    setError('');
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      // iOS Safari'nin canvas piksel sınırına (~16.7M) takılmamak için uzun kenar kısıtlanır.
      const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      openCrop(ctx.getImageData(0, 0, canvas.width, canvas.height), null);
    } catch {
      setError('Görsel açılamadı. Farklı bir dosya deneyin.');
    } finally {
      setBusy('');
    }
  }

  function removePage(id: number) {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((p) => p.id !== id);
      if (!next.length) setStage('camera');
      return next;
    });
  }

  async function save() {
    if (!type || !activeTaxpayerId || !pages.length) return;
    setBusy('Hazırlanıyor…');
    setError('');
    try {
      const files = await Promise.all(
        pages.map((p, i) => imageDataToJpeg(p.processed, `${type.code}-${i + 1}.jpg`)),
      );
      saveScannedPages({
        files,
        documentTypeId: type.id,
        documentTypeCode: type.code,
        documentTypeName: type.name,
        taxpayerId: activeTaxpayerId,
      });
      // Yükleme arka planda sürer; kullanıcı ilerlemeyi Evrak Yükle sayfasında görür.
      navigate('/yukle', { replace: true });
    } catch (e) {
      setError((e as Error).message || 'Kaydedilemedi.');
      setBusy('');
    }
  }

  if (!user) return null;

  if (!documentTypes.length) {
    return <div className="m-scanner"><div className="m-loading" style={{ color: '#fff' }}><span className="m-spinner" /> Hazırlanıyor…</div></div>;
  }

  if (!type || !activeTaxpayerId) {
    return (
      <div className="m-scanner">
        <div className="m-scanner-message" style={{ margin: 'auto' }}>
          <h2>Evrak türü bulunamadı</h2>
          <p>Lütfen Evrak Yükle sayfasından tekrar seçin.</p>
          <button type="button" className="m-btn" onClick={() => navigate('/yukle', { replace: true })}>
            Evrak Yükle&apos;ye Dön
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="m-scanner">
      <header className="m-scanner-bar">
        <button type="button" className="m-scanner-icon-btn" aria-label="Kapat"
          onClick={() => (stage === 'crop' ? (setDraft(null), setStage(pages.length ? 'review' : 'camera')) : navigate('/yukle'))}>
          {stage === 'crop' ? <ArrowLeftIcon width={20} height={20} /> : <XIcon width={20} height={20} />}
        </button>
        <span className="title">
          {type.name}
          {multi && stage !== 'crop' && pages.length > 0 && ` · ${pages.length} sayfa`}
        </span>
        {stage === 'camera' && camera.torchSupported && (
          <button type="button" className={`m-scanner-icon-btn ${camera.torchOn ? 'on' : ''}`}
            aria-label={camera.torchOn ? 'Feneri kapat' : 'Feneri aç'} onClick={camera.toggleTorch}>
            {camera.torchOn ? <FlashIcon width={20} height={20} /> : <FlashOffIcon width={20} height={20} />}
          </button>
        )}
      </header>

      {error && (
        <div className="m-alert error" style={{ margin: '.75rem 1rem 0' }}>
          <AlertCircleIcon width={18} height={18} /><span>{error}</span>
        </div>
      )}

      {stage === 'camera' && (
        <CameraStage camera={camera} multi={multi} pages={pages}
          busy={busy} onShoot={shoot} onPickFile={pickFromFile}
          onFinish={() => setStage('review')} />
      )}

      {stage === 'crop' && draft && (
        <>
          <div className="m-scanner-stage" style={{ padding: '.75rem', overflow: 'auto' }}>
            <CropEditor image={draft.source} quad={draft.quad}
              onChange={(quad) => setDraft((d) => (d ? { ...d, quad } : d))} />
            <p className="m-hint" style={{ color: 'rgba(255,255,255,.7)', textAlign: 'center', margin: '.75rem 0 0' }}>
              {draft.autoDetected
                ? 'Kenarlar otomatik bulundu — gerekirse köşeleri sürükleyin.'
                : 'Belgenin köşelerini sürükleyerek işaretleyin.'}
            </p>
          </div>
          <div className="m-scanner-controls" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button type="button" className="m-scanner-text-btn" disabled={Boolean(busy)}
              onClick={() => setDraft((d) => (d ? { ...d, quad: defaultQuad(d.source.width, d.source.height, 0) } : d))}>
              <CropIcon width={16} height={16} /> Tümünü Seç
            </button>
            <button type="button" className="m-btn compact" style={{ justifySelf: 'end' }}
              disabled={Boolean(busy)} onClick={confirmCrop}>
              {busy ? <span className="m-spinner" /> : <><CheckIcon width={18} height={18} /> Onayla</>}
            </button>
          </div>
        </>
      )}

      {stage === 'review' && (
        <ReviewStage pages={pages} busy={busy} multi={multi}
          onRemove={removePage}
          onRecrop={(page) => {
            // Yeniden düzenlemede köşeler kullanıcının onayladığı hâlden gelir — tespit
            // tekrar çalıştırılmaz, yoksa elle yapılan düzeltme geri alınırdı.
            setDraft({ source: page.source, quad: page.quad, replacingId: page.id, autoDetected: true });
            setStage('crop');
          }}
          onAddMore={() => setStage('camera')}
          onSave={save} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ kamera -- */

interface CameraStageProps {
  camera: ReturnType<typeof useCamera>;
  multi: boolean;
  pages: Page[];
  busy: string;
  onShoot: () => void;
  onPickFile: (file: File) => void;
  onFinish: () => void;
}

function CameraStage({ camera, multi, pages, busy, onShoot, onPickFile, onFinish }: CameraStageProps) {
  if (camera.error) {
    const text = CAMERA_ERROR_TEXT[camera.error.kind];
    return (
      <div className="m-scanner-stage">
        <div className="m-scanner-message">
          <h2>{text.title}</h2>
          <p>{camera.error.kind === 'other' ? camera.error.message : text.body}</p>
          <div style={{ display: 'grid', gap: '.5rem', marginTop: '1.25rem' }}>
            <button type="button" className="m-btn" onClick={camera.retry}>Tekrar Dene</button>
            {/* Kamera hiç açılamasa bile kullanıcı sıkışmasın: yerel kamera arayüzü
                veya galeri her cihazda çalışır. */}
            <FileFallback onPick={onPickFile} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="m-scanner-stage">
        {/* playsInline + muted iOS için ZORUNLU — yoksa Safari tam ekran oynatıcıya geçer. */}
        <video ref={camera.attachVideo} playsInline muted autoPlay />
        {!camera.ready
          ? <div className="m-scanner-status"><span className="m-spinner" /> Kamera açılıyor…</div>
          : <div className="m-scanner-status ok">Belgeyi kadraja alın</div>}
      </div>

      {multi && pages.length > 0 && (
        <div className="m-thumb-strip">
          {pages.map((p, i) => (
            <div key={p.id} className="m-thumb">
              <img src={p.previewUrl} alt={`Sayfa ${i + 1}`} />
              <span className="m-thumb-index">{i + 1}</span>
            </div>
          ))}
        </div>
      )}

      <div className="m-scanner-controls">
        <div className="m-scanner-side">
          <FileFallback onPick={onPickFile} compact />
        </div>
        <button type="button" className="m-shutter" aria-label="Fotoğraf çek"
          disabled={!camera.ready || Boolean(busy)} onClick={onShoot} />
        <div className="m-scanner-side right">
          {multi && pages.length > 0 && (
            <button type="button" className="m-scanner-text-btn" onClick={onFinish}>
              Bitir ({pages.length})
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function FileFallback({ onPick, compact }: { onPick: (f: File) => void; compact?: boolean }) {
  return (
    <label className={compact ? 'm-scanner-icon-btn' : 'm-btn secondary'} style={{ cursor: 'pointer' }}
      aria-label="Galeriden seç">
      <CameraIcon width={compact ? 20 : 18} height={compact ? 20 : 18} />
      {!compact && ' Galeriden Seç'}
      <input type="file" accept="image/*" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
    </label>
  );
}

/* ------------------------------------------------------- gözden geçirme ---- */

interface ReviewStageProps {
  pages: Page[];
  busy: string;
  multi: boolean;
  onRemove: (id: number) => void;
  onRecrop: (page: Page) => void;
  onAddMore: () => void;
  onSave: () => void;
}

function ReviewStage({ pages, busy, multi, onRemove, onRecrop, onAddMore, onSave }: ReviewStageProps) {
  return (
    <>
      <div className="m-scanner-stage" style={{ display: 'block', overflowY: 'auto', padding: '1rem' }}>
        <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '.875rem', margin: '0 0 .875rem' }}>
          {pages.length === 1
            ? 'Belge kaydedilmeye hazır.'
            : `${pages.length} sayfa taradınız — her biri ayrı evrak olarak kaydedilecek.`}
        </p>
        <div className="m-review-grid">
          {pages.map((p, i) => (
            <div key={p.id} className="m-review-item">
              <img src={p.previewUrl} alt={`Sayfa ${i + 1}`} />
              <span className="m-review-index">{i + 1}</span>
              <div className="m-review-actions">
                <button type="button" aria-label={`Sayfa ${i + 1} köşelerini düzelt`} onClick={() => onRecrop(p)}>
                  <RetakeIcon width={15} height={15} />
                </button>
                <button type="button" aria-label={`Sayfa ${i + 1} sil`} onClick={() => onRemove(p.id)}>
                  <TrashIcon width={15} height={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="m-scanner-controls" style={{ gridTemplateColumns: multi ? '1fr 1fr' : '1fr' }}>
        {multi && (
          <button type="button" className="m-scanner-text-btn" disabled={Boolean(busy)} onClick={onAddMore}>
            <LayersIcon width={16} height={16} /> Sayfa Ekle
          </button>
        )}
        <button type="button" className="m-btn compact" style={{ justifySelf: 'end' }}
          disabled={Boolean(busy) || !pages.length} onClick={onSave}>
          {busy ? <><span className="m-spinner" /> {busy}</> : <><CheckIcon width={18} height={18} /> {pages.length > 1 ? `${pages.length} Evrağı Kaydet` : 'Kaydet'}</>}
        </button>
      </div>
    </>
  );
}
