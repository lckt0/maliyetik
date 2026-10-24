import { useEffect, useMemo, useState } from 'react';
import { bumpData, useDataVersion } from '../dataBus';
import { usePreferences } from '../preferences';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, apiError, apiGet } from '../api/client';
import { useAuth } from '../auth';
import { useIdSelection } from '../hooks';
import { useDialog } from './DialogProvider';
import { DIRECTION_LABELS, DocumentRow, DocumentType, GroupSummary, Paginated } from '../types';
import { DateInput } from './DateInput';
import { DocumentViewModal } from './DocumentViewModal';
import { DocumentEditModal } from './DocumentEditModal';
import { ChangeGroupModal } from './ChangeGroupModal';
import { RenameGroupModal } from './RenameGroupModal';
import { Pagination } from './Pagination';
import { ChevronRightIcon, DownloadIcon, EyeIcon, LayersIcon, PencilIcon, RestoreIcon, TrashIcon } from './Icons';
import { downloadDocument, downloadGroupZip } from '../utils/download';
import { isoToDisplay } from '../utils/date';
import { formatDate } from '../utils/date';

interface Props {
  endpoint: '/documents' | '/company-documents';
  documentTypes: DocumentType[];
  category?: 'financial' | 'company' | 'other';
  refreshKey?: number;
  /** 'trash' — çöp kutusu görünümü: geri yükle/kalıcı sil, silinme tarihi, kategori filtresi yok. */
  mode?: 'active' | 'trash';
  /** Verilirse filtre çubuğu gizlenir, sorgu bu sabit filtrelerle atılır (grup detay sayfası ve
   *  dijitalleştirme kuyruğu listeleri kullanır). */
  fixedFilters?: { documentTypeId?: number; groupNo?: string; isDigitized?: boolean };
  /** false ise tablo sabit yükseklik/iç scroll almaz, sayfayla birlikte uzar. */
  scrollable?: boolean;
  /**
   * Dışarıdan uygulanan filtre (doğal dille arama). Değiştiğinde filtre çubuğu bu
   * değerlerle doldurulur ve sorgu yeniden atılır — kullanıcı sonucu görüp elle
   * düzeltebilsin diye alanlar gizlenmez, doldurulur.
   */
  externalFilter?: Partial<DocumentFilters> & { key: number };
}

export interface DocumentFilters {
  documentTypeId: string;
  q: string;
  dateFrom: string;
  dateTo: string;
  docNo: string;
  direction: string;
  /** Tutar aralığı yalnızca doğal dille aramadan gelir; filtre çubuğunda alanı yok. */
  amountMin: string;
  amountMax: string;
}

const EMPTY: DocumentFilters = {
  documentTypeId: '', q: '', dateFrom: '', dateTo: '', docNo: '', direction: '',
  amountMin: '', amountMax: '',
};

function fmtAmount(v: number | string | undefined): string {
  if (v === undefined || v === null || v === '') return '—';
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DocumentsTable({
  endpoint, documentTypes, category, refreshKey, mode = 'active', fixedFilters,
  scrollable = true, externalFilter,
}: Props) {
  const { user, activeTaxpayerId } = useAuth();
  const { confirm, alert: alertDialog } = useDialog();
  const location = useLocation();
  const navigate = useNavigate();
  const isTrash = mode === 'trash';
  const typeOptions = isTrash
    ? documentTypes
    : documentTypes.filter((t) => (category ? t.category === category : t.category !== 'company'));
  const typeName = (id: number) => documentTypes.find((t) => t.id === id)?.name ?? id;
  const groupableTypeIds = useMemo(
    () => new Set(documentTypes.filter((t) => t.metadataSchema?.groupField).map((t) => t.id)),
    [documentTypes],
  );

  const [filters, setFilters] = useState<DocumentFilters>(EMPTY);
  const [applied, setApplied] = useState<DocumentFilters>(EMPTY);
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [groupSummaries, setGroupSummaries] = useState<Record<string, GroupSummary>>({});
  const [viewId, setViewId] = useState<string | null>(null);
  const [editDoc, setEditDoc] = useState<DocumentRow | null>(null);
  const [groupDoc, setGroupDoc] = useState<DocumentRow | null>(null);
  const [renameGroupTarget, setRenameGroupTarget] = useState<{ typeId: number; groupNo: string } | null>(null);
  const [zipBusyKey, setZipBusyKey] = useState<string | null>(null);
  const { selected, toggle: toggleSelected, clear: clearSelection, replaceAll: replaceSelection } = useIdSelection();
  const [bulkBusy, setBulkBusy] = useState(false);

  const listEndpoint = isTrash ? `${endpoint}/trash` : endpoint;
  // Başka bir ekranda (yükleme, dijitalleştirme, mobil uygulama, çöp kutusu) evrak
  // değiştiğinde bu liste de sayfa yenilenmeden tazelensin — bkz. dataBus.ts.
  const dataKey = endpoint === '/company-documents' ? 'company-documents' as const : 'documents' as const;
  const dataVersion = useDataVersion(dataKey);
  // Sayfa başına satır sayısı kullanıcı tercihi (Ayarlar > Panel).
  const { pageSize } = usePreferences();
  const needsTaxpayer = user?.role === 'accountant';
  const blocked = needsTaxpayer && !activeTaxpayerId;
  // Toplu seçim yalnızca ana Evraklar/Çöp Kutusu listelerinde — grup detayı, dijitalleştirme
  // kuyruğu (fixedFilters) ve Şirket Evrakları (ayrı, checklist tarzı bir akış) kapsam dışı.
  const bulkSelectable = endpoint === '/documents' && !fixedFilters;

  async function load(p: number) {
    setLoading(true); setError(''); clearSelection();
    try {
      const params: Record<string, string | number> = { limit: fixedFilters ? 50 : pageSize, page: p };
      if (fixedFilters) {
        if (fixedFilters.documentTypeId != null) params.documentTypeId = fixedFilters.documentTypeId;
        if (fixedFilters.groupNo != null) params.groupNo = fixedFilters.groupNo;
        if (fixedFilters.isDigitized != null) params.isDigitized = String(fixedFilters.isDigitized);
      } else {
        if (applied.documentTypeId) params.documentTypeId = applied.documentTypeId;
        if (applied.q) params.q = applied.q;
        if (applied.dateFrom) params.dateFrom = applied.dateFrom;
        if (applied.dateTo) params.dateTo = applied.dateTo;
        if (applied.docNo) params.docNo = applied.docNo;
        if (applied.direction) params.direction = applied.direction;
        if (!isTrash && category) params.category = category;
      }
      if (applied.amountMin) params.amountMin = applied.amountMin;
      if (applied.amountMax) params.amountMax = applied.amountMax;
      if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
      const data = await apiGet<Paginated<DocumentRow>>(listEndpoint, params);
      setRows(data.items);
      setTotalPages(data.totalPages ?? 1);
      setPage(p);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  // Doğal dille arama sonucu: hem görünen filtre çubuğunu hem uygulanan filtreyi tazeler.
  useEffect(() => {
    if (!externalFilter) return;
    const next = { ...EMPTY, ...externalFilter } as DocumentFilters;
    setFilters(next);
    setApplied(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalFilter?.key]);

  useEffect(() => {
    if (blocked) return;
    load(1);
    // eslint-disable-next-line
  }, [applied, refreshKey, dataVersion, pageSize, listEndpoint, activeTaxpayerId, blocked, fixedFilters?.documentTypeId, fixedFilters?.groupNo, fixedFilters?.isDigitized]);

  // Backend artık her (tür, fiş grup no) çiftini zaten TEK satıra indirger (bkz.
  // `DocumentsService.baseScopedQuery` — sayfalama ham satır değil "görüntü birimi"
  // üzerinden yapılıyor), bu yüzden burada sayfa-içi tekrar sayımı GEREKMİYOR — gelen
  // her satır zaten ya sıradan bir evrak ya da bir grubun tek temsilcisi. Gerçek üye
  // sayısı (1 mi yoksa 2+ mi) `groupSummary()`den gelir; 1 çıkarsa normal satır gibi
  // gösterilir (bkz. render).
  const { displayRows, groupKeys } = useMemo(() => {
    // Çöp kutusunda gruplama YAPILMAZ: silinen bir Fiş Grubu'nun üyeleri "Fiş Grup" satırı
    // olarak toplanırsa o satırda Zip/Yeniden Adlandır/Grubu Sil gibi AKTİF liste eylemleri
    // görünür — Geri Yükle/Kalıcı Sil değil. Çöp kutusunda her evrak kendi satırında kalmalı.
    if (fixedFilters || isTrash) return { displayRows: rows.map((doc) => ({ kind: 'row' as const, doc })), groupKeys: [] as string[] };
    const keys: string[] = [];
    const out: Array<
      | { kind: 'row'; doc: DocumentRow }
      | { kind: 'group'; key: string; doc: DocumentRow; typeId: number; groupNo: string }
    > = [];
    for (const r of rows) {
      const k = groupableTypeIds.has(r.documentTypeId) && r.metaReceiptGroupNo
        ? `${r.documentTypeId}:${r.metaReceiptGroupNo}` : null;
      if (k) {
        keys.push(k);
        out.push({ kind: 'group', key: k, doc: r, typeId: r.documentTypeId, groupNo: r.metaReceiptGroupNo! });
      } else {
        out.push({ kind: 'row', doc: r });
      }
    }
    return { displayRows: out, groupKeys: keys };
  }, [rows, groupableTypeIds, fixedFilters, isTrash]);

  useEffect(() => {
    const missing = groupKeys.filter((k) => !(k in groupSummaries));
    if (!missing.length) return;
    missing.forEach(async (k) => {
      const [typeId, groupNo] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
      try {
        const params: Record<string, string> = { documentTypeId: typeId, groupNo };
        if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
        const summary = await apiGet<GroupSummary>('/documents/group-summary', params);
        setGroupSummaries((m) => ({ ...m, [k]: summary }));
      } catch {
        // sessiz geç — sayfa-içi kaba sayım rozet olarak kalır
      }
    });
    // eslint-disable-next-line
  }, [groupKeys]);

  if (blocked) {
    return (
      <div className="card">
        <p>Devam etmek için önce üst bardan bir mükellef seçin.</p>
        <Link className="btn" to="/musavir/mukellefler">Mükelleflerime Git</Link>
      </div>
    );
  }

  function openGroup(typeId: number, groupNo: string) {
    navigate(`${location.pathname}/grup/${typeId}/${encodeURIComponent(groupNo)}`);
  }
  async function deleteGroup(typeId: number, groupNo: string) {
    if (!await confirm(`"${groupNo}" fiş grubundaki TÜM evrakları çöp kutusuna taşımak istediğinize emin misiniz?`, { danger: true, confirmLabel: 'Grubu Sil' })) return;
    try {
      const params: Record<string, string | number> = { documentTypeId: typeId, groupNo };
      if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
      await api.delete('/documents/group', { params });
      load(page);
    } catch (e) { alertDialog(apiError(e)); }
  }
  async function zipGroup(typeId: number, groupNo: string) {
    const key = `${typeId}:${groupNo}`;
    setZipBusyKey(key);
    try {
      await downloadGroupZip(endpoint, typeId, groupNo, activeTaxpayerId, `Fis-Grubu-${groupNo}`);
    } catch (e) {
      alertDialog(apiError(e));
    } finally {
      setZipBusyKey((k) => (k === key ? null : k));
    }
  }
  async function remove(id: string) {
    if (!await confirm('Bu evrağı çöp kutusuna taşımak istediğinize emin misiniz?')) return;
    try { await api.delete(`${endpoint}/${id}`); bumpData(dataKey, 'quota'); load(page); }
    catch (e) { alertDialog(apiError(e)); }
  }
  async function restore(id: string) {
    try { await api.post(`${endpoint}/${id}/restore`); bumpData(dataKey, 'quota'); load(page); }
    catch (e) { alertDialog(apiError(e)); }
  }
  async function purge(id: string) {
    if (!await confirm('Bu evrağı KALICI olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz. Evrağın kotası iade edilir.', { danger: true, confirmLabel: 'Kalıcı Sil' })) return;
    try { await api.delete(`${endpoint}/${id}/purge`); bumpData(dataKey, 'quota'); load(page); }
    catch (e) { alertDialog(apiError(e)); }
  }

  const selectableIds = displayRows.filter((r) => r.kind === 'row').map((r) => r.doc.id);
  const allSelectedOnPage = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  function toggleSelectAll() {
    replaceSelection(selectableIds);
  }
  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!await confirm(`Seçili ${ids.length} evrağı çöp kutusuna taşımak istediğinize emin misiniz?`)) return;
    setBulkBusy(true);
    try { await api.post('/documents/bulk-delete', { ids }); bumpData(dataKey, 'quota'); load(page); }
    catch (e) { alertDialog(apiError(e)); }
    finally { setBulkBusy(false); }
  }
  async function bulkRestore() {
    const ids = [...selected];
    if (!ids.length) return;
    setBulkBusy(true);
    try { await api.post('/documents/bulk-restore', { ids }); bumpData(dataKey, 'quota'); load(page); }
    catch (e) { alertDialog(apiError(e)); }
    finally { setBulkBusy(false); }
  }
  async function bulkPurge() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!await confirm(`Seçili ${ids.length} evrağı KALICI olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz. Bu evrakların kotası iade edilir.`, { danger: true, confirmLabel: 'Kalıcı Sil' })) return;
    setBulkBusy(true);
    try { await api.post('/documents/bulk-purge', { ids }); bumpData(dataKey, 'quota'); load(page); }
    catch (e) { alertDialog(apiError(e)); }
    finally { setBulkBusy(false); }
  }
  async function emptyTrash() {
    if (!await confirm('Çöp kutusundaki TÜM evrakları kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz. Silinen evrakların kotası iade edilir.', { danger: true, confirmLabel: 'Çöp Kutusunu Boşalt' })) return;
    setBulkBusy(true);
    try {
      const params: Record<string, string> = {};
      if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
      await api.post('/documents/trash/empty', null, { params });
      bumpData(dataKey, 'quota');
      load(1);
    } catch (e) { alertDialog(apiError(e)); }
    finally { setBulkBusy(false); }
  }

  const colCount = 8 + (bulkSelectable ? 1 : 0);

  function renderRow(d: DocumentRow) {
    return (
      <tr key={d.id}>
        {bulkSelectable && (
          <td onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelected(d.id)} />
          </td>
        )}
        <td>{typeName(d.documentTypeId)}</td>
        <td>
          {d.title}
          {!d.isDigitized && <span className="badge pending" style={{ marginLeft: '.5rem' }}>Dijitalleştirilmedi</span>}
        </td>
        <td>{d.metaDocNo ?? '—'}</td>
        <td>{d.metaDirection ? DIRECTION_LABELS[d.metaDirection] : '—'}</td>
        <td>{d.metaAmount ? `${fmtAmount(d.metaAmount)} ${(d.metadata?.currency as string) ?? ''}` : '—'}</td>
        <td>{d.metaTaxId ?? '—'}</td>
        <td>{isoToDisplay(d.documentDate) || '—'}</td>
        <td>{formatDate((isTrash ? d.deletedAt : d.createdAt) ?? d.createdAt)}</td>
        <td className="row-actions">
          {isTrash ? (
            <>
              <button type="button" className="icon-btn" title="Geri Yükle" onClick={() => restore(d.id)}><RestoreIcon /></button>
              <button type="button" className="icon-btn danger" title="Kalıcı Sil" onClick={() => purge(d.id)}><TrashIcon /></button>
            </>
          ) : (
            <>
              <button type="button" className="icon-btn" title="Görüntüle" onClick={() => setViewId(d.id)}><EyeIcon /></button>
              <button type="button" className="icon-btn" title="İndir"
                onClick={() => downloadDocument(endpoint, d.id).catch((e) => alertDialog(apiError(e)))}><DownloadIcon /></button>
              {!d.isDigitized && groupableTypeIds.has(d.documentTypeId) && (
                <button type="button" className="icon-btn" title="Fiş Grubu Değiştir" onClick={() => setGroupDoc(d)}><LayersIcon /></button>
              )}
              {d.isDigitized && (
                <button type="button" className="icon-btn" title="Düzenle" onClick={() => setEditDoc(d)}><PencilIcon /></button>
              )}
              <button type="button" className="icon-btn danger" title="Sil" onClick={() => remove(d.id)}><TrashIcon /></button>
            </>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div>
      {!fixedFilters && (
        <div className="toolbar">
          <div className="field">
            <label>Tür</label>
            <select value={filters.documentTypeId}
              onChange={(e) => setFilters({ ...filters, documentTypeId: e.target.value })}>
              <option value="">Tümü</option>
              {typeOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Ara (başlık)</label>
            <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></div>
          <div className="field"><label>Belge No</label>
            <input value={filters.docNo} onChange={(e) => setFilters({ ...filters, docNo: e.target.value })} /></div>
          <div className="field">
            <label>Yön</label>
            <select value={filters.direction} onChange={(e) => setFilters({ ...filters, direction: e.target.value })}>
              <option value="">Tümü</option>
              <option value="alis">Alış</option>
              <option value="satis">Satış</option>
            </select>
          </div>
          <div className="field"><label>Başl. Tarih</label>
            <DateInput value={filters.dateFrom} onChange={(v) => setFilters({ ...filters, dateFrom: v })} /></div>
          <div className="field"><label>Bitiş Tarih</label>
            <DateInput value={filters.dateTo} onChange={(v) => setFilters({ ...filters, dateTo: v })} /></div>
          <button className="btn" onClick={() => setApplied({ ...filters })}>Filtrele</button>
          <button className="btn secondary" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); }}>Temizle</button>
        </div>
      )}

      {error && <div className="alert error">{error}</div>}

      {bulkSelectable && (
        <div className="toolbar" style={{ marginBottom: '.75rem', justifyContent: 'space-between' }}>
          <span className="muted">{selected.size > 0 ? `${selected.size} evrak seçili` : 'Toplu işlem için evrak seçin.'}</span>
          <div style={{ display: 'flex', gap: '.5rem' }}>
            {selected.size > 0 && !isTrash && (
              <button type="button" className="btn danger sm" disabled={bulkBusy} onClick={bulkDelete}>
                Seçilenleri Sil ({selected.size})
              </button>
            )}
            {selected.size > 0 && isTrash && (
              <>
                <button type="button" className="btn secondary sm" disabled={bulkBusy} onClick={bulkRestore}>
                  Seçilenleri Geri Yükle ({selected.size})
                </button>
                <button type="button" className="btn danger sm" disabled={bulkBusy} onClick={bulkPurge}>
                  Seçilenleri Kalıcı Sil ({selected.size})
                </button>
              </>
            )}
            {isTrash && (
              <button type="button" className="btn danger sm" disabled={bulkBusy} onClick={emptyTrash}>
                Çöp Kutusunu Boşalt
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`table-wrap ${scrollable ? 'fixed-h' : ''}`}>
        <table className="compact">
          <thead>
            <tr>
              {bulkSelectable && (
                <th style={{ width: '2rem' }}>
                  <input type="checkbox" checked={allSelectedOnPage} onChange={toggleSelectAll} disabled={selectableIds.length === 0} />
                </th>
              )}
              <th>Tür</th><th>Başlık</th><th>Belge No</th><th>Yön</th><th>Tutar</th><th>VKN/TCKN</th><th>Tarih</th>
              <th>{isTrash ? 'Silindi' : 'Yüklendi'}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={colCount + 1} className="muted">Yükleniyor…</td></tr>}
            {!loading && displayRows.length === 0 && <tr><td colSpan={colCount + 1} className="muted">Kayıt yok.</td></tr>}
            {!loading && displayRows.map((r) => {
              if (r.kind === 'group') {
                const summary = groupSummaries[r.key];
                // Gerçekte tek üyeli çıkan bir "grup" (nadir) — sıradan satır gibi göster.
                if (summary && summary.count <= 1) return renderRow(r.doc);
                const count = summary?.count;
                const total = summary?.totalAmount;
                return (
                  <tr key={r.key} className="group-row" onClick={() => openGroup(r.typeId, r.groupNo)}>
                    {bulkSelectable && <td onClick={(e) => e.stopPropagation()} />}
                    <td>{typeName(r.doc.documentTypeId)}</td>
                    <td>
                      <span className="group-badge"><LayersIcon /> Fiş Grup: {r.groupNo}</span>
                    </td>
                    <td colSpan={2} className="muted">{count ?? '…'} adet Z-Raporu</td>
                    <td>{count !== undefined ? fmtAmount(total) : '…'}</td>
                    <td>—</td>
                    <td>{isoToDisplay(r.doc.documentDate) || '—'}</td>
                    <td>{formatDate(r.doc.createdAt)}</td>
                    <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="icon-btn" title="Zip olarak indir" disabled={zipBusyKey === r.key}
                        onClick={() => zipGroup(r.typeId, r.groupNo)}>
                        <DownloadIcon />
                      </button>
                      <button type="button" className="icon-btn" title="Grubu Yeniden Adlandır"
                        onClick={() => setRenameGroupTarget({ typeId: r.typeId, groupNo: r.groupNo })}>
                        <PencilIcon />
                      </button>
                      <button type="button" className="icon-btn danger" title="Grubu Sil"
                        onClick={() => deleteGroup(r.typeId, r.groupNo)}>
                        <TrashIcon />
                      </button>
                      <button type="button" className="icon-btn" title="Grubu görüntüle"
                        onClick={() => openGroup(r.typeId, r.groupNo)}>
                        <ChevronRightIcon />
                      </button>
                    </td>
                  </tr>
                );
              }
              return renderRow(r.doc);
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onChange={load} disabled={loading} />

      {viewId && (
        <DocumentViewModal endpoint={endpoint} id={viewId} documentTypes={documentTypes}
          onClose={() => setViewId(null)} />
      )}
      {editDoc && (
        <DocumentEditModal endpoint={endpoint} doc={editDoc} documentTypes={documentTypes}
          onClose={() => setEditDoc(null)}
          onSaved={() => { bumpData(dataKey); load(page); }} />
      )}
      {groupDoc && (
        <ChangeGroupModal doc={groupDoc} taxpayerId={activeTaxpayerId}
          onClose={() => setGroupDoc(null)}
          onSaved={() => { bumpData(dataKey); load(page); }} />
      )}
      {renameGroupTarget && (
        <RenameGroupModal documentTypeId={renameGroupTarget.typeId} groupNo={renameGroupTarget.groupNo} taxpayerId={activeTaxpayerId}
          onClose={() => setRenameGroupTarget(null)}
          onSaved={() => { bumpData(dataKey); load(page); }} />
      )}
    </div>
  );
}
