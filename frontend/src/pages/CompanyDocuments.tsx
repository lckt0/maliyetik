import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { apiError, apiGet } from '../api/client';
import { useDocumentTypes } from '../hooks';
import { CompanyDocumentUploadModal } from '../components/CompanyDocumentUploadModal';
import { DocumentViewModal } from '../components/DocumentViewModal';
import { DocumentsTable } from '../components/DocumentsTable';
import { AlertCircleIcon, BuildingIcon, CheckCircleIcon, EyeIcon, PlusIcon, UploadIcon } from '../components/Icons';
import { CompanyDocumentStatusItem } from '../types';
import { relativeTime } from '../utils/time';
import { PageIntro } from '../components/PageIntro';

export function CompanyDocuments() {
  const { user, activeTaxpayerId } = useAuth();
  const types = useDocumentTypes();
  const [status, setStatus] = useState<CompanyDocumentStatusItem[] | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [uploadType, setUploadType] = useState<CompanyDocumentStatusItem | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  const blocked = user?.role === 'accountant' && !activeTaxpayerId;

  useEffect(() => {
    if (blocked || !activeTaxpayerId) return;
    apiGet<CompanyDocumentStatusItem[]>('/company-documents/status', { taxpayerId: activeTaxpayerId })
      .then(setStatus)
      .catch((e) => setError(apiError(e)));
  }, [activeTaxpayerId, blocked, refresh]);

  if (blocked) {
    return (
      <div className="card">
        <p>Şirket evraklarını görüntülemek için önce bir mükellef seçin.</p>
        <Link className="btn" to="/musavir/mukellefler">Mükelleflerime Git</Link>
      </div>
    );
  }

  const requiredMissing = status?.filter((s) => s.isRequired && s.uploadedCount === 0).length ?? 0;
  const uploadTypeDef = uploadType ? types.find((t) => t.id === uploadType.id) : undefined;

  return (
    <>
      <PageIntro icon={<BuildingIcon />} title="Şirket Evrakları">
        İmza sirküsü, vergi levhası, ticaret sicil gazetesi gibi sürekli lazım olan evraklara hızlı
        erişim. <b>Kotanızdan düşmez.</b> Hem mükellef hem yetkili müşavir yönetebilir; eksik bir
        evrak kartına tıklayarak doğrudan yükleyebilirsiniz.
      </PageIntro>

      {error && <div className="alert error">{error}</div>}
      {requiredMissing > 0 && (
        <div className="alert warning">
          <AlertCircleIcon /> {requiredMissing} zorunlu şirket evrağı eksik. Aşağıdaki kartlardan tamamlayabilirsiniz.
        </div>
      )}

      <div className="grid cols-4 company-doc-cards">
        {status === null && <p className="muted">Yükleniyor…</p>}
        {status?.map((s) => {
          const uploaded = s.uploadedCount > 0;
          const missingRequired = s.isRequired && !uploaded;
          return (
            <div
              key={s.id}
              className={`card company-doc-card ${uploaded ? 'uploaded' : missingRequired ? 'missing' : 'optional'}`}
              onClick={() => { if (!uploaded) setUploadType(s); }}
              role={uploaded ? undefined : 'button'}
            >
              <div className="company-doc-card-icon">
                {uploaded ? <CheckCircleIcon /> : missingRequired ? <AlertCircleIcon /> : <BuildingIcon />}
              </div>
              <h3 style={{ textTransform: 'none', fontSize: '.95rem', letterSpacing: 0 }}>{s.name}</h3>
              {uploaded ? (
                <>
                  <p className="muted" style={{ margin: '0 0 .5rem' }}>
                    {s.latestTitle} · {s.latestUploadedAt ? relativeTime(s.latestUploadedAt) : ''}
                    {s.uploadedCount > 1 && ` · ${s.uploadedCount} evrak`}
                  </p>
                  <div className="row-actions">
                    <button type="button" className="btn sm secondary" onClick={(e) => { e.stopPropagation(); setViewId(s.latestDocumentId); }}>
                      <EyeIcon /> Görüntüle
                    </button>
                    <button type="button" className="btn sm" onClick={(e) => { e.stopPropagation(); setUploadType(s); }}>
                      <UploadIcon /> Yeni Yükle
                    </button>
                  </div>
                </>
              ) : (
                <p className={missingRequired ? 'company-doc-missing-text' : 'muted'} style={{ margin: 0 }}>
                  {missingRequired ? 'Zorunlu — eksik' : 'Eklemek için tıklayın'}
                  <span className="company-doc-add-icon"><PlusIcon /></span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-head" style={{ marginTop: '1.5rem' }}><h2>Tüm Şirket Evrakları</h2></div>
      <DocumentsTable endpoint="/company-documents" documentTypes={types} category="company" refreshKey={refresh} />

      {uploadType && uploadTypeDef && (
        <CompanyDocumentUploadModal
          type={uploadTypeDef}
          taxpayerId={activeTaxpayerId}
          onClose={() => setUploadType(null)}
          onUploaded={() => setRefresh((n) => n + 1)}
        />
      )}
      {viewId && (
        <DocumentViewModal endpoint="/company-documents" id={viewId} documentTypes={types} onClose={() => setViewId(null)} />
      )}
    </>
  );
}
