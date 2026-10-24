import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiError } from '../../api/client';
import { useAuth } from '../../auth';
import { useMyTaxpayers } from '../../taxpayers';
import { useDocumentTypes } from '../../hooks';
import { bumpData } from '../../dataBus';
import { AlertCircleIcon, CheckCircleIcon, ImportIcon, SearchIcon } from '../../components/Icons';
import { FileDropzone } from '../../components/FileDropzone';
import { WizardPanel, WizardSteps } from '../../components/WizardSteps';
import { useDialog } from '../../components/DialogProvider';
import {
  LucaParsedDocument, RawLucaEntry, VknCandidate,
  findVknCandidates, ownVknFoundInArchive, parseLucaZipRaw, resolveLucaDocuments,
} from '../../utils/lucaImport';
import { isoToDisplay } from '../../utils/date';

const DIRECTION_LABELS: Record<string, string> = { alis: 'Alış', satis: 'Satış' };
const TYPE_LABELS: Record<string, string> = { e_arsiv_fatura: 'e-Arşiv Fatura', e_fatura: 'e-Fatura' };

type RowStatus = 'idle' | 'uploading' | 'done' | 'skipped' | 'failed';
type RowFilter = 'all' | 'selected' | 'failed' | 'error';

interface Row extends LucaParsedDocument {
  selected: boolean;
  status: RowStatus;
  statusMessage?: string;
}

const CONCURRENCY = 3;

const STEPS = [
  { label: 'Arşivi Seç', hint: "Luca'dan indirdiğiniz .zip" },
  { label: 'Gözden Geçir', hint: 'Faturaları kontrol edip seçin' },
  { label: 'İçe Aktar', hint: 'Yükleme ve sonuç' },
];

function money(v: string): string {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (v || '—');
}

/**
 * Luca'dan indirilmiş zip arşivini (dış zip → GUID adlı iç zip'ler, her biri xml+html
 * çifti) içe aktarır. Ayrıştırma tamamen istemci tarafında (JSZip); içe aktarım her belge
 * için mevcut `POST /documents` ucunu tek tek çağırır — html dosyası backend'de otomatik
 * PDF'e dönüştürülüp öyle saklanır.
 *
 * Akış üç adımlı bir sihirbazdır (dosya seçimi, önizleme, içe aktarma). Ayrıştırma ve
 * yükleme ilerlemesi çubuk + sayaçlarla izlenir, yükleme durdurulabilir ve başarısızlar
 * tek tuşla yeniden denenebilir.
 */
export function LucaImport() {
  const { user, activeTaxpayerId } = useAuth();
  const documentTypes = useDocumentTypes();
  const { confirm } = useDialog();
  // Seçili mükellefin VKN'si ortak mükellef listesinden okunur — liste henüz gelmediyse
  // `undefined` (bekle), geldiği hâlde VKN yoksa `null` (uyar).
  const { current: activeAuth, loading: taxpayersLoading } = useMyTaxpayers();
  const ownVkn = taxpayersLoading && !activeAuth ? undefined : (activeAuth?.taxpayer?.vknTckn ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ done: 0, total: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  const [importing, setImporting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [current, setCurrent] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [entries, setEntries] = useState<RawLucaEntry[] | null>(null);
  const [candidates, setCandidates] = useState<VknCandidate[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RowFilter>('all');
  const cancelRef = useRef(false);

  // Mükellef değişirse yarım kalmış bir arşivin satırları yeni mükellefe yüklenmesin.
  useEffect(() => { reset(); }, [activeTaxpayerId]);

  const blocked = user?.role === 'accountant' && !activeTaxpayerId;

  const step = rows.length === 0 && candidates.length === 0 ? 0 : (importing || finished ? 2 : 1);

  const stats = useMemo(() => {
    const usable = rows.filter((r) => !r.error);
    return {
      total: rows.length,
      usable: usable.length,
      broken: rows.length - usable.length,
      selected: usable.filter((r) => r.selected).length,
      done: rows.filter((r) => r.status === 'done').length,
      skipped: rows.filter((r) => r.status === 'skipped').length,
      failed: rows.filter((r) => r.status === 'failed').length,
      alis: usable.filter((r) => r.metadata.direction === 'alis').length,
      satis: usable.filter((r) => r.metadata.direction === 'satis').length,
      amount: usable.reduce((s, r) => s + (parseFloat(r.metadata.totalAmount) || 0), 0),
    };
  }, [rows]);

  const processed = stats.done + stats.skipped + stats.failed;
  const importTotal = useMemo(() => rows.filter((r) => r.selected && !r.error).length, [rows]);
  const percent = importTotal ? Math.round((processed / importTotal) * 100) : 0;

  const visibleRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    return rows.filter((r) => {
      if (filter === 'selected' && !r.selected) return false;
      if (filter === 'failed' && r.status !== 'failed') return false;
      if (filter === 'error' && !r.error) return false;
      if (!q) return true;
      return [r.metadata.documentNo, r.metadata.counterpartyTitle, r.metadata.vknTckn, r.metadata.documentDate]
        .some((v) => (v ?? '').toLocaleLowerCase('tr').includes(q));
    });
  }, [rows, search, filter]);

  function reset() {
    setFile(null);
    setRows([]);
    setEntries(null);
    setCandidates([]);
    setMsg(null);
    setFinished(false);
    setSearch('');
    setFilter('all');
    setParseProgress({ done: 0, total: 0 });
  }

  async function onFilePick(f: File | null) {
    reset();
    setFile(f);
    if (!f) return;
    if (!ownVkn) {
      setMsg({ kind: 'error', text: 'Seçili mükellefin VKN/TCKN bilgisi bulunamadı — alış/satış yönü belirlenemez.' });
      return;
    }
    setParsing(true);
    try {
      const parsedEntries = await parseLucaZipRaw(f, (done, total) => setParseProgress({ done, total }));
      if (ownVknFoundInArchive(parsedEntries, ownVkn)) {
        applyResolution(parsedEntries, ownVkn);
      } else {
        // Sistemdeki VKN arşivle eşleşmiyor — sessizce tahmin etmek yerine kullanıcıya
        // arşivde geçen VKN'lerden hangisinin kendi şirketi olduğunu seçtiriyoruz.
        setEntries(parsedEntries);
        setCandidates(findVknCandidates(parsedEntries));
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Zip ayrıştırılamadı.' });
    } finally {
      setParsing(false);
    }
  }

  function applyResolution(entriesToResolve: RawLucaEntry[], effectiveOwnVkn: string) {
    const parsed = resolveLucaDocuments(entriesToResolve, effectiveOwnVkn);
    setRows(parsed.map((p) => ({ ...p, selected: !p.error, status: 'idle' as RowStatus })));
    setCandidates([]);
  }

  function chooseOwnVkn(vkn: string) {
    if (!entries) return;
    applyResolution(entries, vkn);
  }

  function toggleRow(ettn: string) {
    setRows((rs) => rs.map((r) => (r.ettn === ettn ? { ...r, selected: !r.selected } : r)));
  }

  function setAllVisible(selected: boolean) {
    const ids = new Set(visibleRows.filter((r) => !r.error).map((r) => r.ettn));
    setRows((rs) => rs.map((r) => (ids.has(r.ettn) ? { ...r, selected } : r)));
  }

  async function runImport(target: Row[]) {
    if (!activeTaxpayerId || !target.length) return;
    const taxpayerId = activeTaxpayerId;
    cancelRef.current = false;
    setImporting(true);
    setFinished(false);
    setMsg(null);

    const queue = [...target];
    async function worker() {
      let row: Row | undefined;
      // eslint-disable-next-line no-cond-assign
      while ((row = queue.shift())) {
        if (cancelRef.current) return;
        const item = row;
        setCurrent(`${TYPE_LABELS[item.documentTypeCode]} ${item.metadata.documentNo} — ${item.metadata.counterpartyTitle}`);
        setRows((rs) => rs.map((r) => (r.ettn === item.ettn ? { ...r, status: 'uploading', statusMessage: undefined } : r)));
        try {
          const type = documentTypes.find((t) => t.code === item.documentTypeCode);
          if (!type) throw new Error('Evrak türü bulunamadı.');
          const fd = new FormData();
          fd.append('file', new File([item.htmlBlob], `${item.ettn}.html`, { type: 'text/html' }));
          fd.append('documentTypeId', String(type.id));
          fd.append('taxpayerId', taxpayerId);
          fd.append('title', `${type.name} ${item.metadata.documentNo}`);
          fd.append('metadata', JSON.stringify(item.metadata));
          fd.append('source', 'luca_import');
          await api.post('/documents', fd);
          setRows((rs) => rs.map((r) => (r.ettn === item.ettn ? { ...r, status: 'done' } : r)));
        } catch (e) {
          const isDuplicate = (e as { response?: { status?: number } })?.response?.status === 409;
          setRows((rs) => rs.map((r) => (r.ettn === item.ettn
            ? { ...r, status: isDuplicate ? 'skipped' : 'failed', statusMessage: apiError(e) }
            : r)));
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    // Yüklenen faturalar Evraklar/kota ekranlarında sayfa yenilenmeden görünsün.
    bumpData('documents', 'quota');
    setImporting(false);
    setCurrent('');
    setFinished(true);
    if (cancelRef.current) {
      setMsg({ kind: 'error', text: 'İçe aktarım durduruldu. Kalan faturaları "Kalanları İçe Aktar" ile sürdürebilirsiniz.' });
    } else {
      setMsg({ kind: 'success', text: 'İçe aktarım tamamlandı.' });
    }
  }

  async function stopImport() {
    if (await confirm('İçe aktarım durdurulsun mu? Yüklenmiş faturalar sistemde kalır.', { title: 'Durdur', danger: true, confirmLabel: 'Durdur' })) {
      cancelRef.current = true;
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

  const pendingRows = rows.filter((r) => r.selected && !r.error && r.status !== 'done' && r.status !== 'skipped');
  const failedRows = rows.filter((r) => r.status === 'failed');

  return (
    <>
      <div className="section-head"><h2><ImportIcon /> Luca&apos;dan İçe Aktar</h2></div>
      <p className="muted" style={{ marginTop: 0 }}>
        Luca&apos;dan indirdiğiniz e-Fatura/e-Arşiv zip arşivini içe aktarın. Arşiv <b>tamamen tarayıcınızda</b> açılır;
        fatura no, tarih, VKN/TCKN ve tutar bilgileri siz onaylamadan sunucuya gönderilmez.
      </p>

      <WizardSteps steps={STEPS} current={step} />

      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      {ownVkn === null && (
        <div className="alert error">Seçili mükellefin VKN/TCKN bilgisi bulunamadı — alış/satış yönü belirlenemez. Mükellef profilinden VKN/TCKN ekleyin.</div>
      )}

      {step === 0 && (
        <WizardPanel title="1. Luca arşivini seçin">
          <FileDropzone
            accept=".zip"
            disabled={ownVkn === undefined || parsing}
            label="Zip dosyasını buraya sürükleyin veya seçmek için tıklayın"
            hint="Luca → e-Fatura/e-Arşiv dışa aktarımından indirdiğiniz .zip dosyası"
            files={file ? [file] : []}
            onFiles={(fs) => void onFilePick(fs[0] ?? null)}
          />
          {parsing && (
            <div style={{ marginTop: '1rem' }}>
              <div className="upload-progress">
                <div className="upload-progress-bar">
                  <div className="upload-progress-fill"
                    style={{ width: `${parseProgress.total ? Math.round((parseProgress.done / parseProgress.total) * 100) : 0}%` }} />
                </div>
                <span className="upload-progress-pct">
                  {parseProgress.total ? Math.round((parseProgress.done / parseProgress.total) * 100) : 0}%
                </span>
              </div>
              <div className="import-current">
                {parseProgress.total
                  ? `Arşiv okunuyor — ${parseProgress.done} / ${parseProgress.total} fatura`
                  : 'Arşiv açılıyor…'}
              </div>
            </div>
          )}
        </WizardPanel>
      )}

      {candidates.length > 0 && (
        <WizardPanel title="Kendi şirketinizi seçin">
          <p style={{ marginTop: 0 }}>
            Sistemde kayıtlı VKN/TCKN ({ownVkn}) bu arşivdeki hiçbir faturayla eşleşmedi — alış/satış yönünü doğru
            belirleyebilmemiz için lütfen aşağıdaki listeden <b>kendi şirketinizi</b> seçin.
          </p>
          <ul className="widget-list">
            {candidates.map((c) => (
              <li key={c.vkn}>
                <button type="button" className="quota-search-result" onClick={() => chooseOwnVkn(c.vkn)}>
                  <b>{c.title}</b>
                  <span className="muted"> — VKN/TCKN: {c.vkn}</span>
                  <span className="hint"> ({c.supplierCount} kez satıcı, {c.customerCount} kez alıcı olarak geçiyor)</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="wizard-actions">
            <button type="button" className="btn secondary" onClick={reset}>Başka Arşiv Seç</button>
          </div>
        </WizardPanel>
      )}

      {rows.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{step === 2 ? '3. İçe Aktarım' : '2. Faturaları gözden geçirin'}</h3>

          <div className="import-stats">
            <span className="import-stat"><b>{stats.total}</b> fatura</span>
            <span className="import-stat"><b>{stats.alis}</b> alış</span>
            <span className="import-stat"><b>{stats.satis}</b> satış</span>
            <span className="import-stat"><b>{stats.amount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</b> toplam</span>
            {stats.broken > 0 && <span className="import-stat err"><b>{stats.broken}</b> okunamadı</span>}
            {(step === 2 || processed > 0) && (
              <>
                <span className="import-stat ok"><CheckCircleIcon /> <b>{stats.done}</b> yüklendi</span>
                <span className="import-stat warn"><b>{stats.skipped}</b> zaten vardı</span>
                <span className="import-stat err"><AlertCircleIcon /> <b>{stats.failed}</b> başarısız</span>
              </>
            )}
          </div>

          {(importing || (finished && importTotal > 0)) && (
            <>
              <div className="upload-progress">
                <div className="upload-progress-bar">
                  <div className="upload-progress-fill" style={{ width: `${percent}%` }} />
                </div>
                <span className="upload-progress-pct">{percent}%</span>
              </div>
              <div className="import-current">
                {importing ? (current || 'Sıradaki fatura hazırlanıyor…') : `${processed} / ${importTotal} fatura işlendi`}
              </div>
            </>
          )}

          <div className="wizard-actions">
            {!importing && !finished && (
              <>
                <button type="button" className="btn" disabled={stats.selected === 0}
                  onClick={() => void runImport(rows.filter((r) => r.selected && !r.error))}>
                  İçe Aktar ({stats.selected})
                </button>
                <button type="button" className="btn secondary" onClick={() => setAllVisible(true)}>Görünenleri Seç</button>
                <button type="button" className="btn secondary" onClick={() => setAllVisible(false)}>Seçimi Kaldır</button>
                <button type="button" className="btn secondary" onClick={reset}>Başka Arşiv</button>
              </>
            )}
            {importing && (
              <button type="button" className="btn danger" onClick={() => void stopImport()}>Durdur</button>
            )}
            {finished && (
              <>
                {failedRows.length > 0 && (
                  <button type="button" className="btn" onClick={() => void runImport(failedRows)}>
                    Başarısızları Tekrar Dene ({failedRows.length})
                  </button>
                )}
                {pendingRows.length > 0 && (
                  <button type="button" className="btn secondary" onClick={() => void runImport(pendingRows)}>
                    Kalanları İçe Aktar ({pendingRows.length})
                  </button>
                )}
                <Link className="btn secondary" to={user?.role === 'accountant' ? '/musavir/evraklar' : '/mukellef/evraklar'}>
                  Evraklara Git
                </Link>
                <button type="button" className="btn secondary" onClick={reset}>Yeni Arşiv Yükle</button>
              </>
            )}
          </div>

          <div className="wizard-actions" style={{ marginTop: '.5rem' }}>
            <div className="field" style={{ margin: 0, flex: '1 1 240px', maxWidth: 320 }}>
              <label htmlFor="luca-search"><SearchIcon /> Fatura Ara</label>
              <input id="luca-search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Fatura no, unvan veya VKN…" />
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value as RowFilter)} style={{ maxWidth: 200 }}>
              <option value="all">Tümü ({rows.length})</option>
              <option value="selected">Seçililer ({stats.selected})</option>
              <option value="failed">Başarısızlar ({stats.failed})</option>
              <option value="error">Okunamayanlar ({stats.broken})</option>
            </select>
          </div>

          <div className="table-wrap" style={{ marginTop: '.75rem', maxHeight: 520, overflowY: 'auto' }}>
            <table className="compact">
              <thead>
                <tr>
                  <th></th><th>Tür</th><th>Fatura No</th><th>Tarih</th><th>Yön</th><th>Karşı Taraf</th>
                  <th style={{ textAlign: 'right' }}>Tutar</th><th style={{ textAlign: 'right' }}>KDV</th><th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.ettn} className={r.error ? 'muted' : undefined}>
                    <td>
                      <input type="checkbox" checked={r.selected} disabled={!!r.error || importing}
                        aria-label={`${r.metadata.documentNo} seç`}
                        onChange={() => toggleRow(r.ettn)} />
                    </td>
                    <td>{TYPE_LABELS[r.documentTypeCode]}</td>
                    <td>{r.metadata.documentNo || '—'}</td>
                    <td>{isoToDisplay(r.metadata.documentDate) || r.metadata.documentDate || '—'}</td>
                    <td>{r.error ? '—' : DIRECTION_LABELS[r.metadata.direction]}</td>
                    <td>{r.metadata.counterpartyTitle || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{money(r.metadata.totalAmount)}</td>
                    <td style={{ textAlign: 'right' }}>{money(r.metadata.taxAmount)}</td>
                    <td>
                      {r.error && <span className="badge revoked" title={r.error}>Okunamadı</span>}
                      {!r.error && r.status === 'idle' && <span className="muted">Bekliyor</span>}
                      {r.status === 'uploading' && <span className="muted">Yükleniyor…</span>}
                      {r.status === 'done' && <span className="badge active">Yüklendi</span>}
                      {r.status === 'skipped' && <span className="badge">Zaten yüklü</span>}
                      {r.status === 'failed' && <span className="badge revoked" title={r.statusMessage}>Başarısız</span>}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Bu filtreye uyan fatura yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
