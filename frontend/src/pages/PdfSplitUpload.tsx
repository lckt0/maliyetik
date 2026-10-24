import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiDelete, apiError, apiPost } from '../api/client';
import { useAuth } from '../auth';
import { bumpData } from '../dataBus';
import { FileDropzone } from '../components/FileDropzone';
import { WizardPanel, WizardSteps } from '../components/WizardSteps';
import { Spinner } from '../components/Spinner';
import { AlertCircleIcon, CheckCircleIcon, PlusIcon, SparkleIcon, TrashIcon } from '../components/Icons';
import { DocumentType } from '../types';
import { DateInput } from '../components/DateInput';

interface Segment {
  startPage: number;
  endPage: number;
  documentNo?: string;
  documentDate?: string;
  vknTckn?: string;
  counterpartyTitle?: string;
  totalAmount?: string;
  taxAmount?: string;
}

interface Analysis {
  jobId: string;
  fileName: string;
  pageCount: number;
  detectedBy: 'text' | 'ai' | 'none';
  segments: Segment[];
  aiCreditsUsed: number;
  warning?: string;
}

const STEPS = [
  { label: 'PDF Seç', hint: 'Çoklu fatura içeren tek dosya' },
  { label: 'Bölmeyi Onayla', hint: 'Sayfa aralıklarını kontrol edin' },
  { label: 'Kaydet', hint: 'Her fatura ayrı evrak olur' },
];

const DETECTED_LABELS: Record<Analysis['detectedBy'], string> = {
  text: 'PDF metninden otomatik bulundu',
  ai: 'Yapay zeka ile bulundu',
  none: 'Otomatik bulunamadı — elle bölün',
};

interface Props {
  documentTypes: DocumentType[];
  taxpayerId: string | null;
}

/**
 * Çoklu Fatura PDF — tek PDF dosyasında birleştirilmiş faturaları ayırıp her birini
 * ayrı evrak olarak kaydeder.
 *
 * Sınır tespiti önce PDF'in metin katmanından yapılır (ücretsiz, dijital e-Fatura/
 * e-Arşiv çıktılarında çok isabetli); yalnızca taranmış (metinsiz) PDF'lerde yapay
 * zekaya düşülür ve o zaman 1 AI kredisi harcanır. Kullanıcı her durumda sayfa
 * aralıklarını önizlemede düzeltebilir — bölme, onaylanmadan yapılmaz.
 */
export function PdfSplitUpload({ documentTypes, taxpayerId }: Props) {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [typeId, setTypeId] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; failed: { startPage: number; reason: string }[] } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  // Bölme yalnızca fatura türleri için anlamlı; şirket evrakları ayrı akış.
  const invoiceTypes = useMemo(
    () => documentTypes.filter((t) => t.category !== 'company'),
    [documentTypes],
  );

  const step = !analysis ? 0 : result ? 2 : 1;

  /** Aralıklar birbirini ezmemeli ve sayfa sayısını aşmamalı — kaydetmeden önce uyarılır. */
  const validation = useMemo(() => {
    if (!analysis) return { ok: true, message: '' };
    const sorted = [...segments].sort((a, b) => a.startPage - b.startPage);
    for (let i = 0; i < sorted.length; i += 1) {
      const s = sorted[i];
      if (s.startPage < 1 || s.endPage > analysis.pageCount) {
        return { ok: false, message: `Sayfa aralığı 1 ile ${analysis.pageCount} arasında olmalı.` };
      }
      if (s.endPage < s.startPage) return { ok: false, message: 'Bitiş sayfası başlangıçtan küçük olamaz.' };
      if (i > 0 && s.startPage <= sorted[i - 1].endPage) {
        return { ok: false, message: 'Sayfa aralıkları çakışıyor.' };
      }
    }
    const covered = sorted.reduce((n, s) => n + (s.endPage - s.startPage + 1), 0);
    return {
      ok: true,
      message: covered < analysis.pageCount
        ? `${analysis.pageCount - covered} sayfa hiçbir faturaya dahil değil — bu sayfalar kaydedilmez.`
        : '',
    };
  }, [segments, analysis]);

  async function analyze(f: File | null) {
    setMsg(null);
    setResult(null);
    setFile(f);
    if (!f || !typeId || !taxpayerId) return;
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('taxpayerId', taxpayerId);
      fd.append('documentTypeId', typeId);
      const res = await api.post('/documents/pdf-split/analyze', fd);
      const data = res.data.data as Analysis;
      setAnalysis(data);
      setSegments(data.segments);
      if (data.warning) setMsg({ kind: 'error', text: data.warning });
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
      setFile(null);
    } finally {
      setAnalyzing(false);
    }
  }

  function patch(index: number, p: Partial<Segment>) {
    setSegments((s) => s.map((seg, i) => (i === index ? { ...seg, ...p } : seg)));
  }

  function addSegment() {
    if (!analysis) return;
    const last = segments[segments.length - 1];
    const start = last ? Math.min(last.endPage + 1, analysis.pageCount) : 1;
    setSegments((s) => [...s, { startPage: start, endPage: analysis.pageCount }]);
  }

  /** Bir aralığı verilen sayfadan ikiye böler — "burada yeni fatura başlıyor" durumu. */
  function splitAt(index: number, page: number) {
    setSegments((s) => {
      const seg = s[index];
      if (page <= seg.startPage || page > seg.endPage) return s;
      const left = { ...seg, endPage: page - 1 };
      const right: Segment = { startPage: page, endPage: seg.endPage };
      return [...s.slice(0, index), left, right, ...s.slice(index + 1)];
    });
  }

  async function save() {
    if (!analysis) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiPost<{ created: number; failed: { startPage: number; reason: string }[] }>(
        '/documents/pdf-split/commit',
        { jobId: analysis.jobId, segments, titlePrefix: analysis.fileName.replace(/\.pdf$/i, '').slice(0, 80) },
      );
      setResult(res);
      bumpData('documents', 'quota');
      setMsg({
        kind: res.failed.length ? 'error' : 'success',
        text: res.failed.length
          ? `${res.created} fatura kaydedildi, ${res.failed.length} tanesi kaydedilemedi.`
          : `${res.created} fatura ayrı evrak olarak kaydedildi.`,
      });
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (analysis && !result) await apiDelete(`/documents/pdf-split/${analysis.jobId}`).catch(() => undefined);
    setFile(null);
    setAnalysis(null);
    setSegments([]);
    setResult(null);
    setMsg(null);
  }

  const docsPath = user?.role === 'accountant' ? '/musavir/dijitallestir' : '/mukellef/dijitallestir';

  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Birden fazla faturanın tek PDF dosyasında birleştirildiği durumlar için. Dosya sayfa sayfa
        çözümlenir, fatura sınırları bulunur ve <b>her fatura ayrı evrak</b> olarak kaydedilir.
      </p>

      <WizardSteps steps={STEPS} current={step} />

      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      {step === 0 && (
        <WizardPanel title="1. Evrak türünü ve PDF'i seçin">
          <div className="field" style={{ maxWidth: 340 }}>
            <label htmlFor="split-type">Evrak Türü</label>
            <select id="split-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Seçin…</option>
              {invoiceTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <FileDropzone
            accept="application/pdf"
            disabled={!typeId || analyzing}
            label={typeId ? "PDF'i buraya sürükleyin veya seçmek için tıklayın" : 'Önce evrak türü seçin'}
            hint="Birden fazla fatura içeren tek PDF dosyası"
            files={file ? [file] : []}
            onFiles={(fs) => void analyze(fs[0] ?? null)}
          />
          {analyzing && (
            <div style={{ marginTop: '1rem' }}>
              <Spinner label="PDF çözümleniyor — fatura sınırları aranıyor…" />
              <p className="hint">
                Önce PDF metni taranır (ücretsiz). Dosya taranmış/görüntü ise yapay zekaya düşülür ve
                1 AI kredisi harcanır.
              </p>
            </div>
          )}
        </WizardPanel>
      )}

      {analysis && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{result ? '3. Sonuç' : '2. Bölmeyi onaylayın'}</h3>

          <div className="import-stats">
            <span className="import-stat"><b>{analysis.pageCount}</b> sayfa</span>
            <span className="import-stat"><b>{segments.length}</b> fatura</span>
            <span className={`import-stat ${analysis.detectedBy === 'none' ? 'warn' : 'ok'}`}>
              {analysis.detectedBy === 'ai' && <SparkleIcon />}
              {DETECTED_LABELS[analysis.detectedBy]}
            </span>
            {analysis.aiCreditsUsed > 0 && (
              <span className="import-stat warn"><b>{analysis.aiCreditsUsed}</b> AI kredisi kullanıldı</span>
            )}
            {result && (
              <>
                <span className="import-stat ok"><CheckCircleIcon /> <b>{result.created}</b> kaydedildi</span>
                {result.failed.length > 0 && (
                  <span className="import-stat err"><AlertCircleIcon /> <b>{result.failed.length}</b> başarısız</span>
                )}
              </>
            )}
          </div>

          {!result && validation.message && (
            <div className={`alert ${validation.ok ? '' : 'error'}`}>{validation.message}</div>
          )}

          {!result && (
            <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
              <table className="compact">
                <thead>
                  <tr>
                    <th>#</th><th>Başlangıç</th><th>Bitiş</th><th>Fatura No</th><th>Tarih</th>
                    <th>VKN/TCKN</th><th>Tutar</th><th>KDV</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {segments.map((s, i) => (
                    <tr key={`${s.startPage}-${i}`}>
                      <td>{i + 1}</td>
                      <td>
                        <input type="number" min={1} max={analysis.pageCount} value={s.startPage} style={{ width: 70 }}
                          onChange={(e) => patch(i, { startPage: Number(e.target.value) })} />
                      </td>
                      <td>
                        <input type="number" min={1} max={analysis.pageCount} value={s.endPage} style={{ width: 70 }}
                          onChange={(e) => patch(i, { endPage: Number(e.target.value) })} />
                      </td>
                      <td>
                        <input value={s.documentNo ?? ''} style={{ width: 150 }}
                          onChange={(e) => patch(i, { documentNo: e.target.value })} />
                      </td>
                      <td>
                        <div style={{ width: 140 }}>
                          <DateInput value={s.documentDate ?? ''}
                            onChange={(iso) => patch(i, { documentDate: iso })} />
                        </div>
                      </td>
                      <td>
                        <input value={s.vknTckn ?? ''} style={{ width: 110 }}
                          onChange={(e) => patch(i, { vknTckn: e.target.value })} />
                      </td>
                      <td>
                        <input value={s.totalAmount ?? ''} style={{ width: 100 }}
                          onChange={(e) => patch(i, { totalAmount: e.target.value })} />
                      </td>
                      <td>
                        <input value={s.taxAmount ?? ''} style={{ width: 90 }}
                          onChange={(e) => patch(i, { taxAmount: e.target.value })} />
                      </td>
                      <td className="row-actions">
                        {s.endPage > s.startPage && (
                          <button type="button" className="btn sm secondary" title="Bu aralığı ikiye böl"
                            onClick={() => splitAt(i, s.startPage + 1)}>Böl</button>
                        )}
                        <button type="button" className="icon-btn sm danger" title="Kaldır"
                          onClick={() => setSegments((sg) => sg.filter((_, idx) => idx !== i))}>
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.failed.length > 0 && (
            <ul className="widget-list">
              {result.failed.map((f) => (
                <li key={f.startPage}><b>Sayfa {f.startPage}</b> — <span className="muted">{f.reason}</span></li>
              ))}
            </ul>
          )}

          <div className="wizard-actions">
            {!result && (
              <>
                <button type="button" className="btn" disabled={saving || !validation.ok || segments.length === 0}
                  onClick={() => void save()}>
                  {saving ? 'Kaydediliyor…' : `${segments.length} Faturayı Kaydet`}
                </button>
                <button type="button" className="btn secondary" onClick={addSegment}><PlusIcon /> Aralık Ekle</button>
              </>
            )}
            {result && <Link className="btn secondary" to={docsPath}>Evrak Dijitalleştir&apos;e Git</Link>}
            <button type="button" className="btn secondary" onClick={() => void reset()}>
              {result ? 'Yeni PDF' : 'Vazgeç'}
            </button>
          </div>

          {!result && (
            <p className="hint">
              Kaydedilen faturalar <b>Evrak Dijitalleştir</b> kuyruğuna düşer; eksik alanları orada
              tamamlayabilirsiniz. Her fatura 1 evrak kotası kullanır.
            </p>
          )}
        </div>
      )}
    </>
  );
}
