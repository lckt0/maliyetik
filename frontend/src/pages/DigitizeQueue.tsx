import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError, apiGet, apiPatch, apiPost } from '../api/client';
import { useAuth } from '../auth';
import { useAutoDigitizeStatus, useDebouncedValue, useDocumentTypes, useIdSelection, useReceiptGroups } from '../hooks';
import { AiCreditSummary, AiDigitizeResult, DocumentRow, Paginated } from '../types';
import { MetadataFieldsEditor, coerceMetadata, metadataToFormValues } from '../components/MetadataFields';
import { MaliHafizaPanel } from '../components/MaliHafizaPanel';
import { fetchFileBlob } from '../utils/download';
import { Spinner } from '../components/Spinner';
import { ScanIcon, SparkleIcon, TrashIcon } from '../components/Icons';
import { useDialog } from '../components/DialogProvider';
import { PageIntro } from '../components/PageIntro';

const QUEUE_PREVIEW_LIMIT = 25;

const MODEL_LABELS: Record<string, string> = { cheap: 'Hızlı model', advanced: 'Gelişmiş model' };

/**
 * Evrak Dijitalleştir — Evrak Kayıt (hızlı yükleme) kuyruğundaki (isDigitized:false)
 * evrakları sırayla gösterir: önizleme + tür şemasına göre doldurulacak form, artı
 * Gemini destekli "Yapay Zeka ile Doldur" (tek evrak) ve "Otomatik Modu Başlat"
 * (toplu, arka planda) seçenekleri. AI önerisi DB'ye yazılmaz — kullanıcı formda
 * gözden geçirip yine "Kaydet ve Devam Et" ile onaylar (PATCH /documents/:id/digitize).
 */
export function DigitizeQueue() {
  const { user, activeTaxpayerId } = useAuth();
  const { confirm, alert: alertDialog } = useDialog();
  const types = useDocumentTypes();
  const [doc, setDoc] = useState<DocumentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [meta, setMeta] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneCount, setDoneCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [queue, setQueue] = useState<DocumentRow[]>([]);
  const [queueHasMore, setQueueHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);

  const [credits, setCredits] = useState<AiCreditSummary | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiDigitizeResult | null>(null);
  const {
    selected: selectedIds, toggle: toggleSelected, remove: unselectId,
    clear: clearSelection, toggleWithin: toggleSelectionWithin,
  } = useIdSelection();

  const blocked = user?.role === 'accountant' && !activeTaxpayerId;

  const autoDigitizeTaxpayerId = user?.role === 'accountant' ? activeTaxpayerId : user?.taxpayerId ?? null;
  const { status: autoDigitize, start: startAutoDigitize, cancel: cancelAutoDigitize } = useAutoDigitizeStatus(autoDigitizeTaxpayerId);
  const autoDigitizeRunning = autoDigitize?.status === 'running';
  const [autoDigitizeError, setAutoDigitizeError] = useState('');
  const [wasAutoDigitizing, setWasAutoDigitizing] = useState(false);

  useEffect(() => {
    if (wasAutoDigitizing && !autoDigitizeRunning) {
      loadCredits();
      setRefreshKey((k) => k + 1);
      loadNext();
    }
    setWasAutoDigitizing(autoDigitizeRunning);
    // eslint-disable-next-line
  }, [autoDigitizeRunning]);

  async function handleStartAutoDigitize() {
    setAutoDigitizeError('');
    try {
      await startAutoDigitize(selectedIds.size > 0 ? Array.from(selectedIds) : undefined);
      clearSelection();
    } catch (e) {
      setAutoDigitizeError(apiError(e));
    }
  }

  // Yalnızca o an görünen (aramayla daraltılmış olabilecek) satırları ekler/çıkarır —
  // arama sonucu görünmeyen ama daha önce seçilmiş evrakların işaretini korur.
  function toggleSelectAllQueue() {
    toggleSelectionWithin(queue.map((q) => q.id));
  }

  function loadCredits() {
    apiGet<AiCreditSummary>('/ai-credits/me').then(setCredits).catch(() => setCredits(null));
  }

  async function loadNext() {
    setLoading(true); setError(''); setAiResult(null);
    try {
      const params: Record<string, string | number> = { isDigitized: 'false', limit: 1, order: 'ASC' };
      if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
      const res = await apiGet<Paginated<DocumentRow>>('/documents', params);
      const next = res.items[0] ?? null;
      setDoc(next);
      setTitle(next?.title ?? '');
      setDescription(next?.description ?? '');
      setMeta({});
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (blocked) { setLoading(false); return; }
    loadNext();
    loadCredits();
    // eslint-disable-next-line
  }, [activeTaxpayerId]);

  // Kuyruk gerçekten değişince (mükellef değişti / bir evrak kaydedildi) önceki seçim
  // artık anlamsız — sıfırlanır. Arama terimi değiştiğinde TETİKLENMEMELİ, aksi halde
  // kullanıcı arama kutusuna yazarken işaretlediği evraklar sürekli kayboluyor.
  useEffect(() => {
    if (blocked) return;
    clearSelection();
  }, [blocked, activeTaxpayerId, refreshKey]);

  useEffect(() => {
    if (blocked) { setQueue([]); return; }
    const params: Record<string, string | number> = { isDigitized: 'false', limit: QUEUE_PREVIEW_LIMIT, order: 'ASC' };
    if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
    if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
    apiGet<Paginated<DocumentRow>>('/documents', params)
      .then((r) => { setQueue(r.items); setQueueHasMore(!!r.nextCursor); })
      .catch(() => { setQueue([]); setQueueHasMore(false); });
    // eslint-disable-next-line
  }, [blocked, activeTaxpayerId, refreshKey, debouncedSearch]);

  useEffect(() => {
    setPreviewUrl(null);
    setPreviewError(false);
    if (!doc) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchFileBlob(`/documents/${doc.id}/file`).then((blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
    }).catch(() => { if (!cancelled) setPreviewError(true); });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc?.id]);

  const type = doc ? types.find((t) => t.id === doc.documentTypeId) : undefined;
  const fields = type?.metadataSchema?.fields ?? [];
  const isImage = doc?.mimeType?.startsWith('image/');
  const isPdf = doc?.mimeType === 'application/pdf';
  const noCredits = credits != null && credits.remaining <= 0;
  // Mali Hafıza Raporu, standart tek-alan-seti "AI ile doldur"/form akışına uymaz — kendi
  // özel çoklu-şerit analiz+onay akışı var (bkz. MaliHafizaPanel).
  const isMaliHafizaRaporu = type?.code === 'mali_hafiza_raporu';
  const receiptGroups = useReceiptGroups(type?.code === 'z_raporu' ? type.id : undefined, activeTaxpayerId);

  /** Kuyruk listesinden tıklanan evraka geçiş — sıradaki tek evrak yerine kullanıcı
   * dilediğini önizleyip düzenleyebilsin diye. Liste zaten tam metadata taşıdığı için
   * ayrı bir istek gerekmez. */
  function selectFromQueue(q: DocumentRow) {
    if (q.id === doc?.id) return;
    setError(''); setAiResult(null);
    setDoc(q);
    setTitle(q.title);
    setDescription(q.description ?? '');
    const qType = types.find((t) => t.id === q.documentTypeId);
    setMeta(metadataToFormValues(qType?.metadataSchema?.fields ?? [], q.metadata));
  }

  async function removeFromQueue(q: DocumentRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (!await confirm('Bu evrağı çöp kutusuna taşımak istediğinize emin misiniz?')) return;
    try {
      await api.delete(`/documents/${q.id}`);
      unselectId(q.id);
      setRefreshKey((k) => k + 1);
      if (q.id === doc?.id) await loadNext();
    } catch (err) {
      alertDialog(apiError(err));
    }
  }

  async function fillWithAi() {
    if (!doc) return;
    setError(''); setAiBusy(true);
    try {
      const result = await apiPost<AiDigitizeResult>(`/documents/${doc.id}/ai-digitize`);
      setAiResult(result);
      setTitle(result.title);
      setMeta((m) => ({ ...m, ...result.metadata }));
      loadCredits();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setAiBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!doc) return;
    setError('');
    const missing = fields.filter((f) => f.required && !meta[f.key]);
    if (missing.length) return setError(`Zorunlu alan(lar) eksik: ${missing.map((m) => m.label).join(', ')}`);

    setBusy(true);
    try {
      await apiPatch(`/documents/${doc.id}/digitize`, {
        title,
        description,
        metadata: JSON.stringify(coerceMetadata(fields, meta)),
      });
      setDoneCount((c) => c + 1);
      setRefreshKey((k) => k + 1);
      await loadNext();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <div className="card">
        <p>Devam etmek için önce bir mükellef seçin.</p>
        <Link className="btn" to="/musavir/mukellefler">Mükelleflerime Git</Link>
      </div>
    );
  }

  const autoDigitizePercent = autoDigitize?.total
    ? Math.round(((autoDigitize.processed ?? 0) / autoDigitize.total) * 100)
    : 0;

  return (
    <>
      <PageIntro icon={<ScanIcon />} title="Evrak Dijitalleştir">
        Hızlıca yüklenmiş ama fatura no, tarih, tutar gibi alanları henüz doldurulmamış evraklar
        burada sırayla gösterilir. Bu alanlar dolmadan evraklar listelerde filtrelenemez ve KDV
        hesabına girmez. Yapay zeka ile otomatik doldurup gözden geçirerek kaydedebilirsiniz.
        {doneCount > 0 && ` Bu oturumda ${doneCount} evrak dijitalleştirildi.`}
        {credits && <> Kalan AI kredisi: <b>{credits.remaining}</b>.</>}
      </PageIntro>

      <div className="card" style={{ marginBottom: '1rem' }}>
        {autoDigitizeError && <div className="alert error">{autoDigitizeError}</div>}
        {!autoDigitizeRunning && (
          <>
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn" disabled={noCredits} onClick={handleStartAutoDigitize}>
                <SparkleIcon /> {selectedIds.size > 0 ? `Seçili ${selectedIds.size} Evrağı Başlat` : 'Otomatik Modu Başlat'}
              </button>
              <button type="button" className="btn secondary" disabled={!doc || aiBusy || noCredits || isMaliHafizaRaporu} onClick={fillWithAi}
                title={isMaliHafizaRaporu ? 'Mali Hafıza Raporu tek evrak olarak değil, kutucuğu işaretleyip Otomatik Modu Başlat/Seçili Evrağı Başlat ile işlenir.' : undefined}>
                <SparkleIcon /> {aiBusy ? 'Yapay zeka çalışıyor…' : 'Yapay Zeka ile Doldur'}
              </button>
            </div>
            <p className="hint" style={{ marginTop: '.5rem', marginBottom: 0 }}>
              {selectedIds.size > 0
                ? 'Kuyruk listesinde işaretlediğiniz evrakları yapay zeka ile otomatik doldurup kaydeder.'
                : 'Kuyruktaki tüm evrakları yapay zeka ile otomatik doldurup kaydeder — sol listeden belirli evraklar da işaretleyebilirsiniz.'}{' '}
              "Yapay Zeka ile Doldur" ise yalnızca o an önizlediğiniz tek evrağı doldurur; formda gözden geçirip
              siz kaydedersiniz. Arka planda çalışır, ilerleme bildirimler bölümünde görünür.
              Mali Hafıza Raporu'nda bu akış yalnızca AI analizini çalıştırır — evrak sırada kalır, KDV oranı/ödeme
              türünü sonradan siz seçip onaylarsınız.
              {noCredits && ' AI krediniz kalmadı — yöneticinizden kredi talep edin.'}
            </p>
            {aiResult && (
              <p className="hint" style={{ marginBottom: 0 }}>
                {MODEL_LABELS[aiResult.modelUsed]} · güven: %{Math.round(aiResult.confidence * 100)}
                {aiResult.uncertainFields.length > 0 && ` · belirsiz alanlar: ${aiResult.uncertainFields.join(', ')}`}
                — kaydetmeden önce gözden geçirin.
              </p>
            )}
          </>
        )}
        {autoDigitizeRunning && (
          <>
            <p style={{ fontWeight: 600, marginTop: 0 }}>Otomatik dijitalleştirme çalışıyor…</p>
            <div className="notif-progress-bar">
              <div className="notif-progress-bar-fill" style={{ width: `${autoDigitizePercent}%` }} />
            </div>
            <p className="hint" style={{ marginBottom: 0 }}>
              {autoDigitize?.processed ?? 0} / {autoDigitize?.total ?? 0} evrak (%{autoDigitizePercent})
              {autoDigitize?.currentDocTitle && ` — son işlenen: ${autoDigitize.currentDocTitle}`}
            </p>
            <button type="button" className="btn secondary" style={{ marginTop: '.5rem' }} onClick={() => cancelAutoDigitize()}>
              Durdur
            </button>
          </>
        )}
      </div>

      {!autoDigitizeRunning && loading && <Spinner label="Yükleniyor…" />}

      {!autoDigitizeRunning && !loading && !doc && (
        <div className="card">
          <p>Dijitalleştirilecek evrak kalmadı.</p>
        </div>
      )}

      {!autoDigitizeRunning && !loading && doc && (
        <div className="digitize-layout">
          <aside className="digitize-queue-rail">
            <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
              <span>Sırada Bekleyen{queueHasMore ? ` (${queue.length}+)` : queue.length ? ` (${queue.length})` : ''}</span>
              {queue.length > 0 && (
                <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontWeight: 400, cursor: 'pointer' }}>
                  <input type="checkbox" checked={queue.length > 0 && queue.every((q) => selectedIds.has(q.id))} onChange={toggleSelectAllQueue} />
                  Tümü
                </label>
              )}
            </h3>
            <input type="search" className="digitize-queue-search" placeholder="Sırada ara…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <ul className="digitize-queue-list thin-scroll">
              {queue.length === 0 && (
                <li className="muted digitize-queue-empty">
                  {debouncedSearch.trim() ? 'Aramanızla eşleşen evrak yok.' : 'Kuyrukta başka evrak yok.'}
                </li>
              )}
              {queue.map((q) => {
                const qIsMaliHafizaRaporu = types.find((t) => t.id === q.documentTypeId)?.code === 'mali_hafiza_raporu';
                return (
                <li key={q.id} className={`clickable ${q.id === doc.id ? 'active' : ''}`}
                  onClick={() => selectFromQueue(q)} title="Bu evrağı önizle">
                  <input type="checkbox" checked={selectedIds.has(q.id)}
                    onClick={(e) => e.stopPropagation()} onChange={() => toggleSelected(q.id)}
                    title={qIsMaliHafizaRaporu
                      ? 'Otomatik moda dahil et — yalnızca AI analizi çalıştırılır, KDV oranı/ödeme türünü sonradan siz onaylarsınız.'
                      : 'Otomatik moda dahil et'} />
                  <span className="digitize-queue-item-main">
                    <span className="digitize-queue-title">{q.title}</span>
                    <span className="digitize-queue-type">{types.find((t) => t.id === q.documentTypeId)?.name ?? ''}</span>
                  </span>
                  <button type="button" className="icon-btn danger sm" title="Çöp kutusuna taşı"
                    onClick={(e) => removeFromQueue(q, e)}>
                    <TrashIcon />
                  </button>
                </li>
                );
              })}
            </ul>
          </aside>

          <div className="digitize-preview">
            <div className="digitize-preview-frame">
              {previewUrl ? (
                <>
                  {isImage && <img src={previewUrl} alt={doc.title} />}
                  {isPdf && <iframe className="doc-view-frame" src={previewUrl} title={doc.title} />}
                  {!isImage && !isPdf && <p className="muted">Bu dosya türü için önizleme yok.</p>}
                </>
              ) : previewError ? (
                <p className="muted">Önizleme yüklenemedi. Dosya depolamada bulunamadı.</p>
              ) : <Spinner label="Önizleme yükleniyor…" />}
            </div>
          </div>

          {isMaliHafizaRaporu ? (
            <MaliHafizaPanel taxpayerId={activeTaxpayerId} documentTypes={types} doc={doc}
              onDigitized={() => { setDoneCount((c) => c + 1); setRefreshKey((k) => k + 1); loadNext(); }} />
          ) : (
            <form className="card digitize-form" onSubmit={submit}>
              {error && <div className="alert error">{error}</div>}

              <div className="field">
                <label>Evrak Türü</label>
                <input value={type?.name ?? ''} disabled />
              </div>
              <div className="field">
                <label>Başlık <span className="req">*</span></label>
                <input value={title} required onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="field">
                <label>Açıklama</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <MetadataFieldsEditor fields={fields} values={meta}
                onChange={(key, v) => setMeta((m) => ({ ...m, [key]: v }))}
                fieldOptions={type?.code === 'z_raporu' ? { receiptGroupNo: receiptGroups } : undefined} />

              <button className="btn" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet ve Devam Et'}</button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
