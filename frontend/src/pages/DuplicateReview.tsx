import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiError, apiGet } from '../api/client';
import { useDialog } from '../components/DialogProvider';
import { useDocumentTypes } from '../hooks';
import { DocumentRow } from '../types';
import { DocumentViewModal } from '../components/DocumentViewModal';
import { EyeIcon, TrashIcon } from '../components/Icons';
import { Spinner } from '../components/Spinner';
import { isoToDisplay } from '../utils/date';
import { PageIntro } from '../components/PageIntro';
import { LayersIcon } from '../components/Icons';
import { formatDate } from '../utils/date';

function fmtAmount(v: number | string | undefined): string {
  if (v === undefined || v === null || v === '') return '—';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Çift evrak bildirimine tıklanınca açılır — `?ids=` ile gelen belge id'lerini
 * tek tek çekip yan yana gösterir; kullanıcı gözden geçirip gereksiz olan(lar)ı
 * çöp kutusuna taşıyabilir. Bildirim `DuplicateScanService` (backend, günde bir
 * kez) tarafından üretilir: aynı mükellef + tür + Belge No + VKN/TCKN + Tutar.
 */
export function DuplicateReview() {
  const [params] = useSearchParams();
  const ids = useMemo(() => Array.from(new Set((params.get('ids') ?? '').split(',').filter(Boolean))), [params]);
  const documentTypes = useDocumentTypes();
  const { confirm, alert: alertDialog } = useDialog();
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewId, setViewId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const results = await Promise.allSettled(ids.map((id) => apiGet<DocumentRow>(`/documents/${id}`)));
    setRows(results.filter((r): r is PromiseFulfilledResult<DocumentRow> => r.status === 'fulfilled').map((r) => r.value));
    setLoading(false);
  }

  useEffect(() => {
    if (ids.length) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(',')]);

  async function remove(id: string) {
    if (!await confirm('Bu evrağı çöp kutusuna taşımak istediğinize emin misiniz?')) return;
    try {
      await api.delete(`/documents/${id}`);
      setRows((rs) => rs.filter((r) => r.id !== id));
    } catch (e) {
      alertDialog(apiError(e));
    }
  }

  return (
    <>
      <PageIntro icon={<LayersIcon />} title="Çift Evrak Kontrolü">
        Aynı mükellef, tür, belge no, VKN/TCKN ve tutara sahip evraklar — muhtemelen aynı faturanın
        birden fazla kez yüklenmiş hâli. Aynı dosyanın ikinci kez yüklenmesi zaten engelleniyor;
        burada listelenenler farklı dosya ama aynı içerik olabilecek kayıtlar. Gözden geçirip
        gereksiz olanları silin.
      </PageIntro>

      {loading && <Spinner label="Yükleniyor…" />}
      {!loading && rows.length === 0 && (
        <div className="card"><p>Gösterilecek evrak kalmadı — hepsi silinmiş veya bağlantı geçersiz olabilir.</p></div>
      )}

      {!loading && rows.length > 0 && (
        <div className="table-wrap">
          <table className="compact">
            <thead>
              <tr><th>Tür</th><th>Başlık</th><th>Belge No</th><th>Tutar</th><th>VKN/TCKN</th><th>Tarih</th><th>Yüklendi</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>{documentTypes.find((t) => t.id === d.documentTypeId)?.name ?? d.documentTypeId}</td>
                  <td>{d.title}</td>
                  <td>{d.metaDocNo ?? '—'}</td>
                  <td>{fmtAmount(d.metaAmount)}</td>
                  <td>{d.metaTaxId ?? '—'}</td>
                  <td>{isoToDisplay(d.documentDate) || '—'}</td>
                  <td>{formatDate(d.createdAt)}</td>
                  <td className="row-actions">
                    <button type="button" className="icon-btn" title="Görüntüle" onClick={() => setViewId(d.id)}><EyeIcon /></button>
                    <button type="button" className="icon-btn danger" title="Sil" onClick={() => remove(d.id)}><TrashIcon /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewId && (
        <DocumentViewModal endpoint="/documents" id={viewId} documentTypes={documentTypes} onClose={() => setViewId(null)} />
      )}
    </>
  );
}
