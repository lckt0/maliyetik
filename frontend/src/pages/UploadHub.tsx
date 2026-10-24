import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useDocumentTypes } from '../hooks';
import { UploadForm } from '../components/UploadForm';
import { QuickUpload } from './QuickUpload';
import { LucaImport } from './musavir/LucaImport';
import { BulkZipUpload } from './BulkZipUpload';
import { PdfSplitUpload } from './PdfSplitUpload';
import { ImportIcon, InboxIcon, LayersIcon, ScanIcon, UploadIcon } from '../components/Icons';

type Tab = 'quick' | 'detailed' | 'zip' | 'pdf' | 'luca';

interface TabDef {
  key: Tab;
  label: string;
  icon: JSX.Element;
  /** Sekme altında görünen tek satırlık "bu ne işe yarar" açıklaması. */
  hint: string;
  accountantOnly?: boolean;
}

const TABS: TabDef[] = [
  { key: 'quick', label: 'Evrak Kayıt', icon: <InboxIcon />, hint: 'Çok sayıda dosyayı hızlıca yükleyin; alanları sonra Evrak Dijitalleştir\'de tamamlayın.' },
  { key: 'detailed', label: 'Detaylı Yükleme', icon: <UploadIcon />, hint: 'Tek evrağı tüm alanlarıyla birlikte kaydedin; tür ve alanlar otomatik tanınmaya çalışılır.' },
  { key: 'zip', label: 'Toplu ZIP', icon: <LayersIcon />, hint: 'İçinde evrak dosyaları olan herhangi bir zip arşivini tek seferde yükleyin.' },
  { key: 'pdf', label: 'Çoklu Fatura PDF', icon: <ScanIcon />, hint: 'Tek PDF\'te birleştirilmiş faturaları ayırıp her birini ayrı evrak olarak kaydedin.' },
  { key: 'luca', label: 'Luca\'dan İçe Aktar', icon: <ImportIcon />, hint: 'Luca\'dan indirdiğiniz e-Fatura/e-Arşiv zip arşivini içe aktarın.', accountantOnly: true },
];

/**
 * Evrak Yükle — tüm yükleme yolları tek sayfada sekmeler halinde.
 *
 * Hangi sekmenin ne işe yaradığı sekmenin hemen altında bir cümleyle anlatılır:
 * kullanıcı beş seçenek arasında hangisini kullanacağını denemeden anlayabilsin
 *.
 */
export function UploadHub() {
  const { user, activeTaxpayerId } = useAuth();
  const documentTypes = useDocumentTypes();
  const [tab, setTab] = useState<Tab>('quick');

  if (user?.role === 'accountant' && !activeTaxpayerId) {
    return (
      <div className="card">
        <p>Devam etmek için önce bir mükellef seçin.</p>
        <Link className="btn" to="/musavir/mukellefler">Mükelleflerime Git</Link>
      </div>
    );
  }

  const visibleTabs = TABS.filter((t) => !t.accountantOnly || user?.role === 'accountant');
  const activeTab = visibleTabs.find((t) => t.key === tab) ?? visibleTabs[0];

  return (
    <>
      <div className="tabs" role="tablist">
        {visibleTabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: '-.5rem' }}>{activeTab.hint}</p>

      {tab === 'quick' && <QuickUpload />}

      {tab === 'detailed' && (
        <UploadForm documentTypes={documentTypes} taxpayerId={activeTaxpayerId} endpoint="/documents" wizard />
      )}

      {tab === 'zip' && <BulkZipUpload documentTypes={documentTypes} taxpayerId={activeTaxpayerId} />}

      {tab === 'pdf' && <PdfSplitUpload documentTypes={documentTypes} taxpayerId={activeTaxpayerId} />}

      {tab === 'luca' && user?.role === 'accountant' && <LucaImport />}
    </>
  );
}
