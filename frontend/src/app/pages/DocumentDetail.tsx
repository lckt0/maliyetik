import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiDelete, apiError, apiGet } from '../../api/client';
import { useDocumentTypes } from '../../hooks';
import { DIRECTION_LABELS, DocumentRow } from '../../types';
import { AlertCircleIcon, DownloadIcon, TrashIcon } from '../../components/Icons';
import { downloadDocument, fetchFileBlob } from '../../utils/download';
import { isoToDisplay } from '../../utils/date';
import { formatBytes } from '../../utils/formatBytes';
import { MobilePage } from '../shell/MobileShell';
import { ConfirmSheet } from '../shell/Sheet';
import { formatDateTime } from '../../utils/date';

export function DocumentDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const documentTypes = useDocumentTypes();

  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setDoc(null); setError('');
    apiGet<DocumentRow>(`/documents/${id}`).then(setDoc).catch((e) => setError(apiError(e)));
  }, [id]);

  // Önizleme imzasız uygulama ucundan authenticated blob olarak çekilir — depolama
  // sağlayıcısına ait hiçbir URL DOM'a yazılmaz (masaüstü DocumentViewModal ile aynı desen).
  useEffect(() => {
    setPreviewUrl(null); setPreviewFailed(false);
    if (!doc?.fileUrl) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchFileBlob(doc.fileUrl)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => { if (!cancelled) setPreviewFailed(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc?.fileUrl]);

  const type = doc ? documentTypes.find((t) => t.id === doc.documentTypeId) : undefined;
  const isImage = doc?.mimeType?.startsWith('image/') ?? false;

  async function handleDownload() {
    setBusy(true);
    try { await downloadDocument('/documents', id); }
    catch (e) { setError(apiError(e)); }
    finally { setBusy(false); }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await apiDelete(`/documents/${id}`);
      navigate('/evraklar', { replace: true });
    } catch (e) {
      setError(apiError(e));
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <MobilePage title={doc?.title ?? 'Evrak'} back="/evraklar">
      {error && (
        <div className="m-alert error"><AlertCircleIcon width={18} height={18} /><span>{error}</span></div>
      )}

      {!doc && !error && <div className="m-loading"><span className="m-spinner" /> Yükleniyor…</div>}

      {doc && (
        <>
          <div className="m-card" style={{ padding: 0, overflow: 'hidden', marginBottom: '.75rem' }}>
            {previewFailed && <p className="m-hint" style={{ padding: '1.5rem', textAlign: 'center' }}>Önizleme yüklenemedi.</p>}
            {!previewFailed && !previewUrl && (
              <div className="m-loading"><span className="m-spinner" /> Önizleme hazırlanıyor…</div>
            )}
            {previewUrl && isImage && (
              <img src={previewUrl} alt={doc.title} style={{ width: '100%', display: 'block' }} />
            )}
            {previewUrl && !isImage && (
              // PDF/diğer türler: iOS Safari gömülü PDF'i güvenilir göstermiyor, bu yüzden
              // önizleme denemek yerine doğrudan indirmeye yönlendiriliyor.
              <div style={{ padding: '1.5rem', textAlign: 'center' }}>
                <p className="m-hint" style={{ marginTop: 0 }}>
                  Bu dosya türü telefonda önizlenemiyor ({doc.mimeType ?? 'bilinmiyor'}).
                </p>
                <button type="button" className="m-btn compact secondary" disabled={busy} onClick={handleDownload}>
                  <DownloadIcon width={16} height={16} /> Dosyayı Aç
                </button>
              </div>
            )}
          </div>

          <div className="m-card">
            <div className="m-rows">
              <Row label="Tür" value={type?.name ?? '—'} />
              {!doc.isDigitized && (
                <Row label="Durum" value={<span className="m-badge warn">Alanlar eksik</span>} />
              )}
              {doc.documentDate && <Row label="Belge Tarihi" value={isoToDisplay(doc.documentDate)} />}
              {doc.metaDocNo && <Row label="Belge No" value={doc.metaDocNo} />}
              {doc.metaTaxId && <Row label="VKN/TCKN" value={doc.metaTaxId} />}
              {doc.metaAmount && <Row label="Tutar" value={`${Number(doc.metaAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`} />}
              {doc.metaDirection && <Row label="Yön" value={DIRECTION_LABELS[doc.metaDirection]} />}
              {doc.metaReceiptGroupNo && <Row label="Fiş Grubu" value={doc.metaReceiptGroupNo} />}
              {doc.fileSize && <Row label="Boyut" value={formatBytes(Number(doc.fileSize))} />}
              <Row label="Yüklenme" value={formatDateTime(doc.createdAt)} />
            </div>
          </div>

          {!doc.isDigitized && (
            <div className="m-alert info" style={{ marginTop: '.75rem' }}>
              <AlertCircleIcon width={18} height={18} />
              <span>Bu evrağın belge no, tutar gibi alanları henüz doldurulmadı.
                Web panelindeki <strong>Evrak Dijitalleştir</strong> sayfasından tamamlayabilirsiniz.</span>
            </div>
          )}

          <div className="m-btn-row" style={{ marginTop: '.75rem' }}>
            <button type="button" className="m-btn secondary" disabled={busy} onClick={handleDownload}>
              <DownloadIcon width={18} height={18} /> İndir
            </button>
            <button type="button" className="m-btn danger" disabled={busy} onClick={() => setConfirming(true)}>
              <TrashIcon width={18} height={18} /> Sil
            </button>
          </div>
        </>
      )}

      {confirming && (
        <ConfirmSheet
          title="Evrak silinsin mi?"
          description="Evrak çöp kutusuna taşınır; web panelinden geri alabilirsiniz. Çöp
            kutusundaki evraklar kotadan düşmeye devam eder — kota iadesi ancak kalıcı
            silmede yapılır."
          confirmLabel="Sil" danger busy={busy}
          onConfirm={handleDelete} onClose={() => setConfirming(false)}
        />
      )}
    </MobilePage>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="m-row static">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}
