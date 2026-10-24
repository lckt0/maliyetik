import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiError, apiGet } from '../../api/client';
import { useAuth } from '../../auth';
import { useDebouncedValue, useDocumentTypes } from '../../hooks';
import { DocumentRow, GroupSummary, Paginated } from '../../types';
import { AlertCircleIcon, ChevronRightIcon, FolderIcon, LayersIcon, SearchIcon } from '../../components/Icons';
import { FileTextIcon } from '../icons';
import { isoToDisplay } from '../../utils/date';
import { MobilePage } from '../shell/MobileShell';

const PAGE_SIZE = 20;

function formatAmount(v?: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n)
    ? null
    : `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
}

/**
 * Evraklar — masaüstündeki `DocumentsTable` yerine mobil kart listesi. Sunucu tarafı
 * keyset (cursor) sayfalaması aynen kullanılır; kullanıcı listenin sonuna geldikçe
 * IntersectionObserver bir sonraki sayfayı çeker.
 */
export function Documents() {
  const navigate = useNavigate();
  const { activeTaxpayerId } = useAuth();
  const documentTypes = useDocumentTypes();
  const types = documentTypes.filter((t) => t.category !== 'company');

  const [typeId, setTypeId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 350);

  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtre değişince listeyi sıfırla — süregelen bir sayfa isteğinin eski sonucu
  // yeni listeye karışmasın diye her yükleme kendi "istek kimliği" ile korunur.
  const requestId = useRef(0);

  const load = useCallback(async (nextCursor: string | null, reset: boolean) => {
    const id = ++requestId.current;
    setLoading(true);
    if (reset) setError('');
    try {
      const params: Record<string, string | number | boolean> = { limit: PAGE_SIZE };
      // Taranan evraklar `quick` yüklendiği için isDigitized=false doğuyor ve sunucunun
      // varsayılan filtresi onları gizliyor — kullanıcı az önce taradığını göremezdi.
      params.includeUndigitized = true;
      if (typeId) params.documentTypeId = typeId;
      if (q) params.q = q;
      if (nextCursor) params.cursor = nextCursor;
      if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;

      const res = await apiGet<Paginated<DocumentRow>>('/documents', params);
      if (id !== requestId.current) return;   // eskimiş yanıt
      setRows((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setDone(!res.nextCursor || res.items.length === 0);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(apiError(e));
      setDone(true);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [typeId, q, activeTaxpayerId]);

  useEffect(() => {
    setRows([]); setCursor(null); setDone(false);
    void load(null, true);
  }, [load]);

  /**
   * Fiş grubu özetleri. Sunucu, aynı Fiş Grubu No'lu evrakları listede TEK temsilci satıra
   * indiriyor (bkz. DocumentsService.list) — toplu Z-Raporu taraması mobilde tek evrak
   * gibi görünüyordu. Grup satırlarının gerçek üye sayısı bu uçtan alınıp rozet olarak
   * gösterilir; masaüstündeki DocumentsTable ile aynı desen.
   */
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const keys = rows
      .filter((r) => r.metaReceiptGroupNo)
      .map((r) => `${r.documentTypeId}:${r.metaReceiptGroupNo}`);
    for (const key of new Set(keys)) {
      if (key in groupCounts) continue;
      const [typeIdPart, groupNo] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
      const params: Record<string, string> = { documentTypeId: typeIdPart, groupNo };
      if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
      apiGet<GroupSummary>('/documents/group-summary', params)
        .then((s) => setGroupCounts((m) => ({ ...m, [key]: s.count })))
        .catch(() => { /* sessiz geç — rozet gösterilmez */ });
    }
    // groupCounts kasıtlı olarak bağımlılık değil: her yeni sayım yeni bir tur tetiklerdi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeTaxpayerId]);

  // Sonsuz kaydırma nöbetçisi
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || loading) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) void load(cursor, false);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, done, loading, load]);

  const typeName = (id: number) => documentTypes.find((t) => t.id === id)?.name ?? '—';

  return (
    <MobilePage title="Evraklar">
      <div className="m-field" style={{ marginBottom: '.875rem', position: 'relative' }}>
        <input type="search" inputMode="search" value={search} placeholder="Evrak ara…"
          aria-label="Evrak ara" style={{ paddingLeft: '2.5rem' }}
          onChange={(e) => setSearch(e.target.value)} />
        <SearchIcon width={18} height={18} aria-hidden="true"
          style={{ position: 'absolute', left: '.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
      </div>

      <div className="m-chips" role="tablist" aria-label="Evrak türü">
        <button type="button" role="tab" aria-selected={typeId === null}
          className={`m-chip ${typeId === null ? 'active' : ''}`} onClick={() => setTypeId(null)}>
          Tümü
        </button>
        {types.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={typeId === t.id}
            className={`m-chip ${typeId === t.id ? 'active' : ''}`} onClick={() => setTypeId(t.id)}>
            {t.name}
          </button>
        ))}
      </div>

      {error && (
        <div className="m-alert error"><AlertCircleIcon width={18} height={18} /><span>{error}</span></div>
      )}

      <div className="m-list">
        {rows.map((doc) => {
          const amount = formatAmount(doc.metaAmount);
          const groupCount = doc.metaReceiptGroupNo
            ? groupCounts[`${doc.documentTypeId}:${doc.metaReceiptGroupNo}`]
            : undefined;
          return (
            <button key={doc.id} type="button" className="m-doc"
              onClick={() => navigate(`/evraklar/${doc.id}`)}>
              <span className="m-doc-icon">
                {groupCount && groupCount > 1
                  ? <LayersIcon width={20} height={20} />
                  : <FileTextIcon width={20} height={20} />}
              </span>
              <span className="m-doc-body">
                <span className="m-doc-title">
                  {groupCount && groupCount > 1
                    ? `${typeName(doc.documentTypeId)} — Fiş Grubu ${doc.metaReceiptGroupNo}`
                    : doc.title}
                </span>
                <span className="m-doc-meta">
                  {groupCount && groupCount > 1
                    ? <span>{groupCount} evrak</span>
                    : <span>{typeName(doc.documentTypeId)}</span>}
                  {doc.documentDate && <span>{isoToDisplay(doc.documentDate)}</span>}
                  {amount && <span>{amount}</span>}
                  {!doc.isDigitized && <span className="m-badge warn">Eksik</span>}
                </span>
              </span>
              <ChevronRightIcon className="m-doc-chevron" width={18} height={18} />
            </button>
          );
        })}
      </div>

      {loading && <div className="m-loading"><span className="m-spinner" /> Yükleniyor…</div>}

      {!loading && !rows.length && !error && (
        <div className="m-empty">
          <FolderIcon />
          <p>{q || typeId ? 'Bu filtreye uyan evrak bulunamadı.' : 'Henüz evrak yok. Evrak Yükle sekmesinden tarayarak başlayın.'}</p>
        </div>
      )}

      {!done && <div ref={sentinel} style={{ height: 1 }} />}
    </MobilePage>
  );
}
