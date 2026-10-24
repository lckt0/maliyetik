import { useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { Link } from 'react-router-dom';
import { api, apiError } from '../api/client';
import { useAuth } from '../auth';
import { bumpData } from '../dataBus';
import { useDialog } from '../components/DialogProvider';
import { FileDropzone } from '../components/FileDropzone';
import { WizardPanel, WizardSteps } from '../components/WizardSteps';
import { AlertCircleIcon, CheckCircleIcon, SearchIcon } from '../components/Icons';
import { formatBytes } from '../utils/formatBytes';
import { DocumentType } from '../types';

/**
 * Sunucunun kabul ettiği tipler (bkz. backend `mime-allowlist.ts`) + html:
 * html dosyaları yüklemede otomatik PDF'e çevriliyor.
 */
const ACCEPTED_EXT = /\.(pdf|jpe?g|png|webp|heic|heif|html?)$/i;
/** Zip içinde sıkça bulunan, evrak olmayan çöp girdiler. */
const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/i;

const CONCURRENCY = 3;
/** Tek arşivde işlenecek azami dosya — tarayıcının belleğini ve kotayı korur. */
const MAX_FILES = 2000;

const STEPS = [
  { label: 'Arşivi Seç', hint: 'Herhangi bir .zip dosyası' },
  { label: 'Gözden Geçir', hint: 'Tür seçin, dosyaları onaylayın' },
  { label: 'Yükle', hint: 'İlerleme ve sonuç' },
];

type RowStatus = 'idle' | 'uploading' | 'done' | 'skipped' | 'failed';

interface Row {
  path: string;
  name: string;
  size: number;
  blob: Blob;
  selected: boolean;
  status: RowStatus;
  message?: string;
}

function mimeFor(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  if (ext === 'html' || ext === 'htm') return 'text/html';
  return 'image/jpeg';
}

interface Props {
  documentTypes: DocumentType[];
  taxpayerId: string | null;
}

/**
 * Toplu ZIP yükleme — Luca arşivi OLMAYAN, içinde serbestçe evrak dosyaları bulunan
 * herhangi bir zip için.
 *
 * Arşiv tamamen tarayıcıda açılır (JSZip) ve her dosya mevcut `POST /documents` ucuna
 * tek tek gönderilir; sunucuda yeni bir uç ya da geçici depolama gerekmez. Evrak türü
 * kullanıcının seçtiği TEK tür olur: dosya adından tür
 * tahmini yapılmaz, böylece 150 dosyalık bir arşivde yanlış türe düşen kayıt olmaz.
 * Alanlar boş kalır; evraklar Evrak Dijitalleştir kuyruğunda tamamlanır.
 */
export function BulkZipUpload({ documentTypes, taxpayerId }: Props) {
  const { user } = useAuth();
  const { confirm } = useDialog();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [typeId, setTypeId] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ done: 0, total: 0 });
  const [uploading, setUploading] = useState(false);
  const [finished, setFinished] = useState(false);
  const [current, setCurrent] = useState('');
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const cancelRef = useRef(false);

  // Şirket evrakları ayrı bir akış (Şirket Evraklarım) — burada yalnızca mali/diğer türler.
  const selectableTypes = useMemo(
    () => documentTypes.filter((t) => t.category !== 'company'),
    [documentTypes],
  );

  const step = rows.length === 0 ? 0 : (uploading || finished ? 2 : 1);

  const stats = useMemo(() => ({
    total: rows.length,
    selected: rows.filter((r) => r.selected).length,
    done: rows.filter((r) => r.status === 'done').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    bytes: rows.filter((r) => r.selected).reduce((s, r) => s + r.size, 0),
  }), [rows]);

  const uploadTotal = stats.selected;
  const processed = stats.done + stats.skipped + stats.failed;
  const percent = uploadTotal ? Math.round((processed / uploadTotal) * 100) : 0;

  const visibleRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    return q ? rows.filter((r) => r.path.toLocaleLowerCase('tr').includes(q)) : rows;
  }, [rows, search]);

  function reset() {
    setFile(null);
    setRows([]);
    setMsg(null);
    setFinished(false);
    setSearch('');
    setParseProgress({ done: 0, total: 0 });
  }

  async function onPick(f: File | null) {
    reset();
    setFile(f);
    if (!f) return;
    setParsing(true);
    try {
      const zip = await JSZip.loadAsync(f);
      const entries = Object.values(zip.files).filter((e) => !e.dir && !JUNK.test(e.name));
      const usable = entries.filter((e) => ACCEPTED_EXT.test(e.name));
      if (!usable.length) {
        throw new Error('Arşivde yüklenebilir bir evrak dosyası bulunamadı (pdf, jpg, png, webp, heic veya html).');
      }
      if (usable.length > MAX_FILES) {
        throw new Error(`Arşivde ${usable.length} dosya var; tek seferde en fazla ${MAX_FILES} dosya yüklenebilir.`);
      }
      setParseProgress({ done: 0, total: usable.length });

      const out: Row[] = [];
      for (const entry of usable) {
        const blob = await entry.async('blob');
        out.push({
          path: entry.name,
          name: entry.name.split('/').pop() || entry.name,
          size: blob.size,
          blob,
          selected: true,
          status: 'idle',
        });
        setParseProgress({ done: out.length, total: usable.length });
        // Büyük arşivlerde arayüz donmasın diye olay döngüsüne yer açıyoruz.
        if (out.length % 10 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      setRows(out);
      const skipped = entries.length - usable.length;
      if (skipped > 0) {
        setMsg({ kind: 'error', text: `${skipped} dosya desteklenmeyen türde olduğu için listeye alınmadı.` });
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Zip açılamadı.' });
    } finally {
      setParsing(false);
    }
  }

  function toggle(path: string) {
    setRows((rs) => rs.map((r) => (r.path === path ? { ...r, selected: !r.selected } : r)));
  }

  function setAllVisible(selected: boolean) {
    const paths = new Set(visibleRows.map((r) => r.path));
    setRows((rs) => rs.map((r) => (paths.has(r.path) ? { ...r, selected } : r)));
  }

  async function runUpload(target: Row[]) {
    if (!typeId || !target.length) return;
    cancelRef.current = false;
    setUploading(true);
    setFinished(false);
    setMsg(null);

    const queue = [...target];
    async function worker() {
      let row: Row | undefined;
      // eslint-disable-next-line no-cond-assign
      while ((row = queue.shift())) {
        if (cancelRef.current) return;
        const item = row;
        setCurrent(item.name);
        setRows((rs) => rs.map((r) => (r.path === item.path ? { ...r, status: 'uploading', message: undefined } : r)));
        try {
          const fd = new FormData();
          fd.append('file', new File([item.blob], item.name, { type: mimeFor(item.name) }));
          fd.append('documentTypeId', typeId);
          if (taxpayerId) fd.append('taxpayerId', taxpayerId);
          fd.append('title', item.name.replace(/\.[^.]+$/, ''));
          fd.append('source', 'bulk_zip');
          await api.post('/documents', fd);
          setRows((rs) => rs.map((r) => (r.path === item.path ? { ...r, status: 'done' } : r)));
        } catch (e) {
          const duplicate = (e as { response?: { status?: number } })?.response?.status === 409;
          setRows((rs) => rs.map((r) => (r.path === item.path
            ? { ...r, status: duplicate ? 'skipped' : 'failed', message: apiError(e) } : r)));
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    bumpData('documents', 'quota');
    setUploading(false);
    setCurrent('');
    setFinished(true);
    setMsg(cancelRef.current
      ? { kind: 'error', text: 'Yükleme durduruldu. Kalan dosyaları "Kalanları Yükle" ile sürdürebilirsiniz.' }
      : { kind: 'success', text: 'Yükleme tamamlandı.' });
  }

  async function stop() {
    if (await confirm('Yükleme durdurulsun mu? Yüklenmiş evraklar sistemde kalır.', { title: 'Durdur', danger: true, confirmLabel: 'Durdur' })) {
      cancelRef.current = true;
    }
  }

  const pending = rows.filter((r) => r.selected && r.status !== 'done' && r.status !== 'skipped');
  const failed = rows.filter((r) => r.status === 'failed');
  const docsPath = user?.role === 'accountant' ? '/musavir/evraklar' : '/mukellef/evraklar';

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        İçinde evrak dosyaları bulunan <b>herhangi bir zip arşivini</b> toplu olarak yükleyin
        (Luca arşivi için ayrı sekmeyi kullanın). Arşiv tarayıcınızda açılır; siz onaylamadan
        hiçbir dosya gönderilmez.
      </p>

      <WizardSteps steps={STEPS} current={step} />

      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      {step === 0 && (
        <WizardPanel title="1. Zip arşivini seçin">
          <FileDropzone
            accept=".zip"
            disabled={parsing}
            label="Zip dosyasını buraya sürükleyin veya seçmek için tıklayın"
            hint="İçindeki pdf, jpg, png, webp, heic ve html dosyaları evrak olarak yüklenir"
            files={file ? [file] : []}
            onFiles={(fs) => void onPick(fs[0] ?? null)}
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
                {parseProgress.total ? `Arşiv okunuyor — ${parseProgress.done} / ${parseProgress.total} dosya` : 'Arşiv açılıyor…'}
              </div>
            </div>
          )}
        </WizardPanel>
      )}

      {rows.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{step === 2 ? '3. Yükleme' : '2. Tür seçin ve dosyaları onaylayın'}</h3>

          {step === 1 && (
            <div className="field" style={{ maxWidth: 340 }}>
              <label htmlFor="bulk-type">Evrak Türü <span className="muted">(tüm dosyalara uygulanır)</span></label>
              <select id="bulk-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="">Seçin…</option>
                {selectableTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <p className="hint">
                Alanlar (fatura no, tutar…) boş kalır; evraklar <b>Evrak Dijitalleştir</b> kuyruğuna düşer ve
                oradan tamamlanır.
              </p>
            </div>
          )}

          <div className="import-stats">
            <span className="import-stat"><b>{stats.total}</b> dosya</span>
            <span className="import-stat"><b>{stats.selected}</b> seçili</span>
            <span className="import-stat"><b>{formatBytes(stats.bytes)}</b></span>
            {(step === 2 || processed > 0) && (
              <>
                <span className="import-stat ok"><CheckCircleIcon /> <b>{stats.done}</b> yüklendi</span>
                <span className="import-stat warn"><b>{stats.skipped}</b> zaten vardı</span>
                <span className="import-stat err"><AlertCircleIcon /> <b>{stats.failed}</b> başarısız</span>
              </>
            )}
          </div>

          {(uploading || (finished && uploadTotal > 0)) && (
            <>
              <div className="upload-progress">
                <div className="upload-progress-bar">
                  <div className="upload-progress-fill" style={{ width: `${percent}%` }} />
                </div>
                <span className="upload-progress-pct">{percent}%</span>
              </div>
              <div className="import-current">
                {uploading ? (current || 'Sıradaki dosya hazırlanıyor…') : `${processed} / ${uploadTotal} dosya işlendi`}
              </div>
            </>
          )}

          <div className="wizard-actions">
            {!uploading && !finished && (
              <>
                <button type="button" className="btn" disabled={!typeId || stats.selected === 0}
                  onClick={() => void runUpload(rows.filter((r) => r.selected))}>
                  {typeId ? `Yükle (${stats.selected})` : 'Önce evrak türü seçin'}
                </button>
                <button type="button" className="btn secondary" onClick={() => setAllVisible(true)}>Görünenleri Seç</button>
                <button type="button" className="btn secondary" onClick={() => setAllVisible(false)}>Seçimi Kaldır</button>
                <button type="button" className="btn secondary" onClick={reset}>Başka Arşiv</button>
              </>
            )}
            {uploading && <button type="button" className="btn danger" onClick={() => void stop()}>Durdur</button>}
            {finished && (
              <>
                {failed.length > 0 && (
                  <button type="button" className="btn" onClick={() => void runUpload(failed)}>
                    Başarısızları Tekrar Dene ({failed.length})
                  </button>
                )}
                {pending.length > 0 && (
                  <button type="button" className="btn secondary" onClick={() => void runUpload(pending)}>
                    Kalanları Yükle ({pending.length})
                  </button>
                )}
                <Link className="btn secondary" to={docsPath}>Evraklara Git</Link>
                <button type="button" className="btn secondary" onClick={reset}>Yeni Arşiv</button>
              </>
            )}
          </div>

          <div className="field" style={{ maxWidth: 320, marginTop: '.5rem' }}>
            <label htmlFor="bulk-search"><SearchIcon /> Dosya Ara</label>
            <input id="bulk-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Dosya adı…" />
          </div>

          <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="compact">
              <thead>
                <tr><th></th><th>Dosya</th><th>Klasör</th><th style={{ textAlign: 'right' }}>Boyut</th><th>Durum</th></tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.path}>
                    <td>
                      <input type="checkbox" checked={r.selected} disabled={uploading}
                        aria-label={`${r.name} seç`} onChange={() => toggle(r.path)} />
                    </td>
                    <td>{r.name}</td>
                    <td className="muted">{r.path.includes('/') ? r.path.slice(0, r.path.lastIndexOf('/')) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{formatBytes(r.size)}</td>
                    <td>
                      {r.status === 'idle' && <span className="muted">Bekliyor</span>}
                      {r.status === 'uploading' && <span className="muted">Yükleniyor…</span>}
                      {r.status === 'done' && <span className="badge active">Yüklendi</span>}
                      {r.status === 'skipped' && <span className="badge">Zaten yüklü</span>}
                      {r.status === 'failed' && <span className="badge revoked" title={r.message}>Başarısız</span>}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={5} className="muted" style={{ textAlign: 'center', padding: '1rem' }}>Eşleşen dosya yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
