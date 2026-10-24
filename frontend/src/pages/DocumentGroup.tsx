import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, apiError, apiGet } from '../api/client';
import { useAuth } from '../auth';
import { useDocumentTypes } from '../hooks';
import { useDialog } from '../components/DialogProvider';
import { DocumentsTable } from '../components/DocumentsTable';
import { RenameGroupModal } from '../components/RenameGroupModal';
import { DownloadIcon, PencilIcon, TrashIcon } from '../components/Icons';
import { downloadGroupZip } from '../utils/download';
import { GroupSummary } from '../types';
import { isoToDisplay } from '../utils/date';

export function DocumentGroup({ endpoint, backTo }: { endpoint: '/documents' | '/company-documents'; backTo: string }) {
  const { typeId, groupNo } = useParams<{ typeId: string; groupNo: string }>();
  const documentTypes = useDocumentTypes();
  const { activeTaxpayerId } = useAuth();
  const { confirm, alert: alertDialog } = useDialog();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<GroupSummary | null>(null);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  const numericTypeId = Number(typeId);
  const decodedGroupNo = groupNo ? decodeURIComponent(groupNo) : '';
  const type = documentTypes.find((t) => t.id === numericTypeId);

  function loadSummary() {
    if (!typeId || !groupNo) return;
    const params: Record<string, string> = { documentTypeId: typeId, groupNo: decodedGroupNo };
    if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
    apiGet<GroupSummary>('/documents/group-summary', params)
      .then(setSummary)
      .catch((e) => setError(apiError(e)));
  }

  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line
  }, [typeId, groupNo, activeTaxpayerId]);

  if (!typeId || !groupNo) return null;

  async function deleteWholeGroup() {
    if (!await confirm(`"${decodedGroupNo}" fiş grubundaki TÜM evrakları (${summary?.count ?? ''} adet) çöp kutusuna taşımak istediğinize emin misiniz?`, { danger: true, confirmLabel: 'Grubu Sil' })) return;
    try {
      const params: Record<string, string | number> = { documentTypeId: numericTypeId, groupNo: decodedGroupNo };
      if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
      await api.delete('/documents/group', { params });
      navigate(backTo);
    } catch (e) { alertDialog(apiError(e)); }
  }

  async function zipWholeGroup() {
    setZipBusy(true);
    try {
      await downloadGroupZip(endpoint, numericTypeId, decodedGroupNo, activeTaxpayerId, `Fis-Grubu-${decodedGroupNo}`);
    } catch (e) {
      alertDialog(apiError(e));
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <button type="button" className="btn secondary sm" onClick={() => navigate(backTo)}>← Evraklara Dön</button>
          <h2 style={{ marginTop: '.75rem' }}>{type?.name ?? 'Evrak Grubu'} — Fiş Grup No: {decodedGroupNo}</h2>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn secondary" disabled={zipBusy} onClick={zipWholeGroup}>
            <DownloadIcon /> {zipBusy ? 'Hazırlanıyor…' : 'Zip Olarak İndir'}
          </button>
          <button type="button" className="btn secondary" onClick={() => setRenaming(true)}>
            <PencilIcon /> Grubu Yeniden Adlandır
          </button>
          <button type="button" className="btn danger" onClick={deleteWholeGroup}>
            <TrashIcon /> Grubu Sil
          </button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      {summary && (
        <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
          <div className="card"><h3>Adet</h3><div className="stat small">{summary.count}</div></div>
          <div className="card"><h3>Toplam Tutar</h3>
            <div className="stat small">{summary.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div></div>
          <div className="card"><h3>Tarih Aralığı</h3>
            <div className="stat small">{isoToDisplay(summary.dateFrom) || '—'}{summary.dateFrom !== summary.dateTo ? ` – ${isoToDisplay(summary.dateTo) || '—'}` : ''}</div></div>
        </div>
      )}

      <DocumentsTable endpoint={endpoint} documentTypes={documentTypes}
        fixedFilters={{ documentTypeId: numericTypeId, groupNo: decodedGroupNo }} />

      {renaming && (
        <RenameGroupModal documentTypeId={numericTypeId} groupNo={decodedGroupNo} taxpayerId={activeTaxpayerId}
          onClose={() => setRenaming(false)}
          onSaved={(_count, newGroupNo) => {
            navigate(`${backTo}/grup/${numericTypeId}/${encodeURIComponent(newGroupNo)}`, { replace: true });
          }} />
      )}
    </div>
  );
}
