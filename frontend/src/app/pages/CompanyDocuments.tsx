import { useCallback, useEffect, useState } from 'react';
import { api, apiDelete, apiError, apiGet } from '../../api/client';
import { useAuth } from '../../auth';
import { bumpData } from '../../dataBus';
import { CompanyDocumentStatusItem, DocumentRow, Paginated } from '../../types';
import {
  AlertCircleIcon, BuildingIcon, CameraIcon, CheckCircleIcon, DownloadIcon, EyeIcon,
  LinkIcon, PlusIcon, TrashIcon,
} from '../../components/Icons';
import { compressImage } from '../../utils/imageCompress';
import { downloadDocument, safeFilename } from '../../utils/download';
import { canShareFiles, shareFile } from '../../utils/share';
import { formatBytes } from '../../utils/formatBytes';
import { relativeTime } from '../../utils/time';
import { MobilePage } from '../shell/MobileShell';
import { ConfirmSheet, Sheet } from '../shell/Sheet';

/**
 * Şirket Evraklarım — imza sirküsü, vergi levhası gibi sabit türler. Kota tüketmez
 * (backend `DocumentCategory.COMPANY` için `quota.consume` çağırmaz).
 *
 * Tür seçilince o türdeki dosyalar listelenir; her dosya önizlenebilir, indirilebilir,
 * cihazın paylaşım sayfasıyla paylaşılabilir ve silinebilir.
 */
export function CompanyDocuments() {
  const { activeTaxpayerId } = useAuth();
  const [items, setItems] = useState<CompanyDocumentStatusItem[] | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<CompanyDocumentStatusItem | null>(null);
  const [files, setFiles] = useState<DocumentRow[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const [viewing, setViewing] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState<DocumentRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!activeTaxpayerId) return;
    apiGet<CompanyDocumentStatusItem[]>('/company-documents/status', { taxpayerId: activeTaxpayerId })
      .then(setItems)
      .catch((e) => setError(apiError(e)));
  }, [activeTaxpayerId]);

  useEffect(load, [load]);

  /** Seçilen türdeki yüklü dosyalar — sheet açılınca çekilir. */
  const loadFiles = useCallback(async (typeId: number) => {
    if (!activeTaxpayerId) return;
    setFiles(null);
    try {
      const res = await apiGet<Paginated<DocumentRow>>('/company-documents', {
        documentTypeId: typeId, taxpayerId: activeTaxpayerId, limit: 50, page: 1, includeUndigitized: 'true',
      });
      setFiles(res.items);
    } catch (e) {
      setError(apiError(e));
      setFiles([]);
    }
  }, [activeTaxpayerId]);

  function openType(item: CompanyDocumentStatusItem) {
    setSuccess('');
    setError('');
    setTarget(item);
    void loadFiles(item.id);
  }

  async function upload(file: File) {
    if (!target || !activeTaxpayerId) return;
    setUploading(true); setError(''); setSuccess('');
    try {
      const payload = file.type.startsWith('image/') ? await compressImage(file) : file;
      const fd = new FormData();
      fd.append('file', payload);
      fd.append('documentTypeId', String(target.id));
      fd.append('taxpayerId', activeTaxpayerId);
      // Alan doğrulaması atlanır — bu türlerin zorunlu alanı yok, kullanıcı sadece dosyayı yükler.
      fd.append('quick', 'true');
      await api.post('/company-documents', fd);
      setSuccess(`${target.name} yüklendi.`);
      bumpData('company-documents');
      await loadFiles(target.id);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleShare(doc: DocumentRow) {
    setBusy(true);
    setError('');
    try {
      const detail = await apiGet<DocumentRow>(`/company-documents/${doc.id}`);
      const shared = detail.fileUrl
        ? await shareFile(detail.fileUrl, safeFilename(detail.originalName || detail.title), detail.title)
        : false;
      // Paylaşım desteklenmiyorsa kullanıcı elde kalmasın — indirmeye düşülür.
      if (!shared) await downloadDocument('/company-documents', doc.id);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting || !target) return;
    setBusy(true);
    try {
      await apiDelete(`/company-documents/${deleting.id}`);
      bumpData('company-documents');
      setDeleting(null);
      await loadFiles(target.id);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  const missing = items?.filter((i) => i.isRequired && i.uploadedCount === 0).length ?? 0;

  return (
    <MobilePage title="Şirket Evraklarım">
      <p className="m-hint" style={{ marginTop: 0 }}>
        İmza sirküsü, vergi levhası gibi evraklara hızlı erişim. Kotanızdan düşmez.
      </p>

      {error && <div className="m-alert error"><AlertCircleIcon width={18} height={18} /><span>{error}</span></div>}
      {success && <div className="m-alert success"><CheckCircleIcon width={18} height={18} /><span>{success}</span></div>}
      {missing > 0 && (
        <div className="m-alert warning">
          <AlertCircleIcon width={18} height={18} />
          <span>{missing} zorunlu şirket evrağı eksik.</span>
        </div>
      )}

      {items === null && !error && <div className="m-loading"><span className="m-spinner" /> Yükleniyor…</div>}

      <div className="m-list">
        {items?.map((item) => {
          const uploaded = item.uploadedCount > 0;
          return (
            <button key={item.id} type="button" className="m-doc" onClick={() => openType(item)}>
              <span className="m-doc-icon" style={uploaded ? undefined : { background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                {uploaded ? <CheckCircleIcon width={20} height={20} /> : <BuildingIcon width={20} height={20} />}
              </span>
              <span className="m-doc-body">
                <span className="m-doc-title">{item.name}</span>
                <span className="m-doc-meta">
                  {uploaded
                    ? <span>{item.uploadedCount} dosya · {item.latestUploadedAt ? relativeTime(item.latestUploadedAt) : '—'}</span>
                    : <span className={`m-badge ${item.isRequired ? 'warn' : ''}`}>{item.isRequired ? 'Zorunlu — eksik' : 'Yüklenmedi'}</span>}
                </span>
              </span>
              <PlusIcon className="m-doc-chevron" width={18} height={18} />
            </button>
          );
        })}
      </div>

      {items && !items.length && !error && (
        <div className="m-empty"><BuildingIcon /><p>Tanımlı şirket evrak türü yok.</p></div>
      )}

      {target && !viewing && !deleting && (
        <Sheet title={target.name}
          description={uploading ? 'Yükleniyor…' : 'Yüklü dosyalar ve yeni yükleme.'}
          onClose={() => { if (!uploading) { setTarget(null); setFiles(null); } }}>
          {files === null && <div className="m-loading"><span className="m-spinner" /> Dosyalar yükleniyor…</div>}

          {files && files.length > 0 && (
            <div className="m-list" style={{ marginBottom: '.75rem' }}>
              {files.map((f) => (
                <div key={f.id} className="m-doc static">
                  <span className="m-doc-body">
                    <span className="m-doc-title">{f.originalName || f.title}</span>
                    <span className="m-doc-meta">
                      {f.fileSize ? formatBytes(Number(f.fileSize)) : '—'} · {relativeTime(f.createdAt)}
                    </span>
                  </span>
                  <span className="m-doc-actions">
                    <button type="button" className="m-icon-btn" title="Görüntüle" disabled={busy}
                      onClick={() => setViewing(f)}><EyeIcon width={18} height={18} /></button>
                    <button type="button" className="m-icon-btn" title={canShareFiles() ? 'Paylaş' : 'İndir'} disabled={busy}
                      onClick={() => void handleShare(f)}>
                      {canShareFiles() ? <LinkIcon width={18} height={18} /> : <DownloadIcon width={18} height={18} />}
                    </button>
                    <button type="button" className="m-icon-btn danger" title="Sil" disabled={busy}
                      onClick={() => setDeleting(f)}><TrashIcon width={18} height={18} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {files && files.length === 0 && (
            <p className="m-hint" style={{ marginTop: 0 }}>Bu türde henüz dosya yok.</p>
          )}

          {uploading ? (
            <div className="m-loading"><span className="m-spinner" /> Yükleniyor…</div>
          ) : (
            <>
              <FilePicker label="Fotoğraf Çek" icon={<CameraIcon width={18} height={18} />}
                accept="image/*" capture onPick={upload} />
              <div style={{ height: '.5rem' }} />
              <FilePicker label="Dosya Seç" icon={<PlusIcon width={18} height={18} />}
                accept="image/*,application/pdf" onPick={upload} secondary />
            </>
          )}
        </Sheet>
      )}

      {viewing && (
        <FileViewerSheet doc={viewing} onClose={() => setViewing(null)} />
      )}

      {deleting && (
        <ConfirmSheet
          title="Dosya silinsin mi?"
          description="Dosya çöp kutusuna taşınır; web panelinden geri alabilirsiniz."
          confirmLabel="Sil" danger busy={busy}
          onConfirm={() => void handleDelete()} onClose={() => setDeleting(null)}
        />
      )}
    </MobilePage>
  );
}

/**
 * Şirket evrağı önizlemesi. Dosya, depolama sağlayıcısına ait hiçbir URL DOM'a
 * yazılmadan, imzasız uygulama ucundan authenticated blob olarak çekilir
 * (masaüstü DocumentViewModal ve mobil DocumentDetail ile aynı desen).
 */
function FileViewerSheet({ doc, onClose }: { doc: DocumentRow; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<DocumentRow | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const full = await apiGet<DocumentRow>(`/company-documents/${doc.id}`);
        if (cancelled) return;
        setDetail(full);
        if (!full.fileUrl) { setFailed(true); return; }
        const { fetchFileBlob } = await import('../../utils/download');
        const blob = await fetchFileBlob(full.fileUrl);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc.id]);

  const isImage = (detail?.mimeType ?? doc.mimeType ?? '').startsWith('image/');

  return (
    <Sheet title={doc.originalName || doc.title} onClose={onClose}>
      {failed && <p className="m-hint">Önizleme yüklenemedi.</p>}
      {!failed && !url && <div className="m-loading"><span className="m-spinner" /> Önizleme hazırlanıyor…</div>}
      {url && isImage && <img src={url} alt={doc.title} style={{ width: '100%', borderRadius: 8, display: 'block' }} />}
      {url && !isImage && (
        // iOS Safari gömülü PDF'i güvenilir göstermiyor — indirmeye yönlendiriliyor.
        <p className="m-hint">Bu dosya türü telefonda önizlenemiyor. Aşağıdan indirebilir ya da paylaşabilirsiniz.</p>
      )}
      <div className="m-btn-row" style={{ marginTop: '.75rem' }}>
        <button type="button" className="m-btn secondary"
          onClick={() => void downloadDocument('/company-documents', doc.id)}>
          <DownloadIcon width={18} height={18} /> İndir
        </button>
        <button type="button" className="m-btn" onClick={onClose}>Kapat</button>
      </div>
    </Sheet>
  );
}

interface FilePickerProps {
  label: string;
  icon: React.ReactNode;
  accept: string;
  /** `capture` verilirse mobil tarayıcı galeri yerine doğrudan kamerayı açar. */
  capture?: boolean;
  secondary?: boolean;
  onPick: (file: File) => void;
}

function FilePicker({ label, icon, accept, capture, secondary, onPick }: FilePickerProps) {
  return (
    <label className={`m-btn ${secondary ? 'secondary' : ''}`} style={{ cursor: 'pointer' }}>
      {icon} {label}
      <input type="file" accept={accept} {...(capture ? { capture: 'environment' as const } : {})}
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = ''; }} />
    </label>
  );
}
