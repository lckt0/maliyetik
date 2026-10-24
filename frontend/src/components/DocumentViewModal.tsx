import { useEffect, useState } from 'react';
import { apiError, apiGet } from '../api/client';
import { DIRECTION_LABELS, DocumentRow, DocumentType } from '../types';
import { SidePanel } from './SidePanel';
import { Spinner } from './Spinner';
import { DownloadIcon } from './Icons';
import { useDialog } from './DialogProvider';
import { downloadDocument, fetchFileBlob } from '../utils/download';
import { isoToDisplay } from '../utils/date';
import { formatDateTime } from '../utils/date';

interface Props {
  endpoint: '/documents' | '/company-documents';
  id: string;
  documentTypes: DocumentType[];
  onClose: () => void;
}

export function DocumentViewModal({ endpoint, id, documentTypes, onClose }: Props) {
  const { alert: alertDialog } = useDialog();
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    apiGet<DocumentRow>(`${endpoint}/${id}`)
      .then(setDoc)
      .catch((e) => setError(apiError(e)));
  }, [endpoint, id]);

  // Önizleme, imzasız uygulama ucundan (fileUrl) authenticated blob olarak çekilir —
  // depolama sağlayıcısına ait hiçbir URL/parametre DOM'a hiç yazılmaz. Object URL
  // yalnızca bu sekmede/oturumda geçerlidir; kopyalanıp paylaşılamaz.
  useEffect(() => {
    setPreviewUrl(null);
    setPreviewError(false);
    if (!doc?.fileUrl) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchFileBlob(doc.fileUrl).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    }).catch(() => { if (!cancelled) setPreviewError(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc?.fileUrl]);

  const type = doc ? documentTypes.find((t) => t.id === doc.documentTypeId) : undefined;
  const fields = type?.metadataSchema?.fields ?? [];
  const isImage = doc?.mimeType?.startsWith('image/');
  const isPdf = doc?.mimeType === 'application/pdf';
  const isHtml = doc?.mimeType === 'text/html';

  async function handleDownload() {
    setDownloading(true);
    try { await downloadDocument(endpoint, id); }
    catch (e) { alertDialog(apiError(e)); }
    finally { setDownloading(false); }
  }

  async function handleOpenNewTab() {
    if (!doc?.fileUrl) return;
    try {
      const blob = await fetchFileBlob(doc.fileUrl);
      // Bilerek revokeObjectURL çağrılmıyor: modal kapanıp bu bileşen unmount olsa bile
      // yeni sekme sekmesi kapanana/sayfa yenilenene kadar geçerli kalması gerekir.
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (e) { alertDialog(apiError(e)); }
  }

  return (
    <SidePanel title={doc?.title ?? 'Evrak'} onClose={onClose} width={1040}>
      {error && <div className="alert error">{error}</div>}
      {!doc && !error && <Spinner label="Yükleniyor…" />}
      {doc && (
        <div className="doc-view">
          <div className="doc-view-preview">
            {previewUrl ? (
              <>
                {isImage && <img src={previewUrl} alt={doc.title} />}
                {isPdf && <iframe className="doc-view-frame" src={previewUrl} title={doc.title} />}
                {isHtml && (
                  <iframe className="doc-view-frame" src={previewUrl} title={doc.title} sandbox="allow-same-origin" />
                )}
                {!isImage && !isPdf && !isHtml && <p className="muted">Bu dosya türü için önizleme yok.</p>}
              </>
            ) : previewError ? (
              <p className="muted">Önizleme yüklenemedi. Dosya depolamada bulunamadı.</p>
            ) : doc.fileUrl ? (
              <Spinner label="Önizleme yükleniyor…" />
            ) : (
              <p className="muted">Önizleme yok.</p>
            )}
          </div>

          <div className="doc-view-side">
            <dl className="doc-view-meta">
              <dt>Tür</dt><dd>{type?.name ?? doc.documentTypeId}</dd>
              {doc.description && (<><dt>Açıklama</dt><dd>{doc.description}</dd></>)}
              {doc.documentDate && (
                <><dt>{fields.find((f) => f.key === 'documentDate')?.label ?? 'Evrak Tarihi'}</dt>
                  <dd>{isoToDisplay(doc.documentDate)}</dd></>
              )}
              {fields.map((f) => {
                if (f.key === 'documentDate') return null;
                const raw = doc.metadata?.[f.key];
                if (raw === undefined || raw === null || raw === '') return null;
                const value = f.type === 'enum' ? (DIRECTION_LABELS[String(raw)] ?? String(raw))
                  : f.type === 'date' ? isoToDisplay(String(raw))
                  : String(raw);
                return (<span key={f.key} style={{ display: 'contents' }}><dt>{f.label}</dt><dd>{value}</dd></span>);
              })}
              {doc.uploadedByName && (<><dt>Yükleyen</dt><dd>{doc.uploadedByName}</dd></>)}
              <dt>Yüklendi</dt><dd>{formatDateTime(doc.createdAt)}</dd>
              {doc.updatedByName && doc.updatedAt && doc.updatedAt !== doc.createdAt && (
                <><dt>Son Düzenleyen</dt><dd>{doc.updatedByName} — {formatDateTime(doc.updatedAt)}</dd></>
              )}
              {!doc.isDigitized && (
                <><dt>Durum</dt><dd><span className="badge pending">Dijitalleştirilmedi</span></dd></>
              )}
              {doc.isDigitized && doc.digitizedByName && doc.digitizedAt && (
                <><dt>Dijitalleştirildi</dt><dd>{doc.digitizedByName} tarafından — {formatDateTime(doc.digitizedAt)}</dd></>
              )}
            </dl>

            {doc.fileUrl && (
              <div className="doc-view-actions">
                <button type="button" className="btn secondary" onClick={handleOpenNewTab}>Yeni Sekmede Aç</button>
                <button type="button" className="btn" disabled={downloading} onClick={handleDownload}>
                  <DownloadIcon /> {downloading ? 'İndiriliyor…' : 'İndir'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </SidePanel>
  );
}
