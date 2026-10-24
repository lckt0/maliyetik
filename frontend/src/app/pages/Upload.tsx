import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useDocumentTypes } from '../../hooks';
import { api, apiError } from '../../api/client';
import { bumpData } from '../../dataBus';
import { DocumentType } from '../../types';
import { AlertCircleIcon, CheckCircleIcon, InboxIcon, LayersIcon, PlusIcon, ScanIcon, UploadIcon } from '../../components/Icons';
import { CameraIcon } from '../../components/Icons';
import { FileTextIcon, ReceiptIcon } from '../icons';
import { compressImage } from '../../utils/imageCompress';
import { MobilePage } from '../shell/MobileShell';
import { Sheet } from '../shell/Sheet';
import { UploadProgress } from '../scanner/UploadProgress';

/**
 * Kamerayla taranması en sık olan türler — üstte büyük düğmeler olarak durur.
 * Tür `code` ile eşlenir; veritabanı id'leri ortamdan ortama değişebileceği için
 * asla sabit kodlanmaz.
 */
const SCANNABLE = [
  { code: 'z_raporu', icon: <ReceiptIcon /> },
  { code: 'mali_hafiza_raporu', icon: <InboxIcon /> },
  { code: 'e_arsiv_fatura', icon: <FileTextIcon /> },
  { code: 'e_fatura', icon: <FileTextIcon /> },
] as const;

/** Yalnızca görsel kabul eden türlerde (fileAccept: image/*) PDF seçimi kapatılır. */
function acceptFor(type: DocumentType): string {
  return type.metadataSchema?.fileAccept === 'image/*' ? 'image/*' : 'image/*,application/pdf';
}

/**
 * Mobil "Evrak Yükle".
 *
 * Tüm aktif evrak türleri listelenir; her tür için "kamerayla tara" ya da
 * "telefondan dosya seç" seçenekleri sunulur.
 */
export function Upload() {
  const navigate = useNavigate();
  const { activeTaxpayerId } = useAuth();
  const documentTypes = useDocumentTypes();
  const [picked, setPicked] = useState<DocumentType | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  // Kullanıcı bu sayfaya geldiyse taramak üzeredir — tarayıcı paketini şimdiden getir ki
  // tür + tekli/çoklu seçimi biterken kamera ekranı anında açılsın.
  useEffect(() => { void import('../scanner/ScannerScreen'); }, []);

  // Şirket evrakları ayrı sekmede (Şirket Evraklarım) yönetiliyor.
  const uploadableTypes = documentTypes.filter((t) => t.category !== 'company');

  // Sıra bozulmasın diye SCANNABLE üzerinden dönülür; sunucuda pasifleştirilmiş
  // (is_active = 0) bir tür listeden hiç gelmez ve burada da görünmez.
  const featured = SCANNABLE
    .map((s) => ({ ...s, type: uploadableTypes.find((t) => t.code === s.code) }))
    .filter((s): s is typeof s & { type: DocumentType } => Boolean(s.type));
  const featuredCodes = new Set(featured.map((f) => f.code as string));
  const otherTypes = uploadableTypes.filter((t) => !featuredCodes.has(t.code));

  function startScan(mode: 'single' | 'multi') {
    if (!picked) return;
    navigate(`/tara?type=${picked.id}&mode=${mode}`);
  }

  /**
   * Telefondan seçilen dosyaları doğrudan yükler. Alanlar boş kalır (`quick`) — evrak
   * Evrak Dijitalleştir kuyruğuna düşer; mobilde uzun form doldurtmak yerine masaüstünde
   * tamamlanması bilinçli tercih.
   */
  async function uploadFiles(files: File[]) {
    if (!picked || !activeTaxpayerId || !files.length) return;
    setUploading(true);
    setMsg(null);
    let ok = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const payload = file.type.startsWith('image/') ? await compressImage(file) : file;
        const fd = new FormData();
        fd.append('file', payload);
        fd.append('documentTypeId', String(picked.id));
        fd.append('taxpayerId', activeTaxpayerId);
        fd.append('quick', 'true');
        fd.append('source', 'mobile');
        await api.post('/documents', fd);
        ok += 1;
      } catch (e) {
        errors.push(`${file.name}: ${apiError(e)}`);
      }
    }
    bumpData('documents', 'quota');
    setUploading(false);
    setPicked(null);
    setMsg(errors.length
      ? { kind: 'error', text: `${ok} dosya yüklendi, ${errors.length} tanesi yüklenemedi. ${errors[0]}` }
      : { kind: 'success', text: `${ok} evrak yüklendi. Alanları web panelindeki Evrak Dijitalleştir'den tamamlayabilirsiniz.` });
  }

  return (
    <MobilePage title="Evrak Yükle">
      <p className="m-hint" style={{ marginTop: 0 }}>
        Evrak türünü seçin; kamerayla tarayabilir ya da telefonunuzdaki bir dosyayı yükleyebilirsiniz.
      </p>

      {msg && (
        <div className={`m-alert ${msg.kind}`}>
          {msg.kind === 'error' ? <AlertCircleIcon width={18} height={18} /> : <CheckCircleIcon width={18} height={18} />}
          <span>{msg.text}</span>
        </div>
      )}

      {!documentTypes.length && <div className="m-loading"><span className="m-spinner" /> Yükleniyor…</div>}

      <div className="m-type-grid">
        {featured.map(({ code, icon, type }) => (
          <button key={code} type="button" className="m-type-btn" onClick={() => { setMsg(null); setPicked(type); }}>
            {icon}
            <span className="m-type-name">{type.name}</span>
          </button>
        ))}
      </div>

      {otherTypes.length > 0 && (
        <button type="button" className="m-btn secondary" style={{ marginTop: '.75rem' }} onClick={() => setAllOpen(true)}>
          <PlusIcon width={18} height={18} /> Diğer Evrak Türleri ({otherTypes.length})
        </button>
      )}

      {documentTypes.length > 0 && !uploadableTypes.length && (
        <div className="m-alert warning">
          <AlertCircleIcon width={18} height={18} />
          <span>Yüklenebilir evrak türü bulunamadı. Lütfen yöneticinize başvurun.</span>
        </div>
      )}

      {/* Yükleme arka planda (uploadManager) sürdüğü için kullanıcı bu sayfaya
          döndüğünde ilerlemeyi burada görmeye devam eder. */}
      <UploadProgress />

      {allOpen && (
        <Sheet title="Tüm Evrak Türleri" description="Yüklemek istediğiniz türü seçin."
          onClose={() => setAllOpen(false)}>
          <div className="m-list">
            {otherTypes.map((t) => (
              <button key={t.id} type="button" className="m-doc"
                onClick={() => { setAllOpen(false); setMsg(null); setPicked(t); }}>
                <span className="m-doc-icon"><FileTextIcon width={20} height={20} /></span>
                <span className="m-doc-body"><span className="m-doc-title">{t.name}</span></span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {picked && (
        <Sheet title={picked.name}
          description={uploading ? 'Yükleniyor…' : 'Nasıl yüklemek istersiniz?'}
          onClose={() => !uploading && setPicked(null)}>
          {uploading ? (
            <div className="m-loading"><span className="m-spinner" /> Yükleniyor…</div>
          ) : (
            <>
              <button type="button" className="m-btn" onClick={() => startScan('single')}>
                <ScanIcon width={20} height={20} /> Kamerayla tara — tek belge
              </button>
              <div style={{ height: '.5rem' }} />
              <button type="button" className="m-btn secondary" onClick={() => startScan('multi')}>
                <LayersIcon width={20} height={20} /> Kamerayla tara — birden fazla
              </button>
              <div style={{ height: '.5rem' }} />
              <label className="m-btn secondary" style={{ cursor: 'pointer' }}>
                <UploadIcon width={20} height={20} /> Telefondan dosya seç
                <input type="file" multiple accept={acceptFor(picked)} style={{ display: 'none' }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = '';
                    if (files.length) void uploadFiles(files);
                  }} />
              </label>
              <div style={{ height: '.5rem' }} />
              <label className="m-btn secondary" style={{ cursor: 'pointer' }}>
                <CameraIcon width={20} height={20} /> Tek kare fotoğraf çek
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void uploadFiles([f]);
                  }} />
              </label>
              <p className="m-hint" style={{ margin: '.875rem 0 0' }}>
                Tarama kenarları otomatik bulur ve düzeltir. Dosya seçerseniz belge olduğu gibi
                yüklenir; alanları web panelindeki <strong>Evrak Dijitalleştir</strong>&apos;den tamamlarsınız.
              </p>
            </>
          )}
        </Sheet>
      )}
    </MobilePage>
  );
}
