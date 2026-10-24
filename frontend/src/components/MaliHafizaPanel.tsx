import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiError, apiPost } from '../api/client';
import { useMaliHafizaJobStatus } from '../hooks';
import { DateInput } from './DateInput';
import { XIcon } from './Icons';
import { homePathFor, useAuth } from '../auth';
import {
  DocumentRow,
  DocumentType,
  MALI_HAFIZA_PAYMENT_TYPE_LABELS,
  MALI_HAFIZA_VAT_RATE_LABELS,
  MaliHafizaPaymentType,
  MaliHafizaStrip,
  MaliHafizaVatRate,
} from '../types';

interface Props {
  taxpayerId: string | null;
  documentTypes: DocumentType[];
  /** Evrak Dijitalleştir'de o an önizlenen "mali_hafiza_raporu" türündeki kaynak evrak. */
  doc: DocumentRow;
  /** Kayıt tamamlandığında (bekleyen kuyruktan çıktığında) çağrılır — sıradaki evrağa geçmek için. */
  onDigitized: () => void;
}

interface EditableEntry {
  documentNo: string;
  documentDate: string;
  totalAmount: string;
  taxAmount: string;
  /** AI bu satırdan emin değildi — kullanıcı düzenledikçe temizlenir. */
  uncertain: boolean;
}

interface EditableStrip {
  label: string;
  vatRate: MaliHafizaVatRate | '';
  paymentType: MaliHafizaPaymentType | '';
  entries: EditableEntry[];
  /** AI'ın bu şerit için genel netlik değerlendirmesi — yalnızca uyarı göstermek için, kaydedilmez. */
  readable: boolean;
  issue?: string;
}

function fmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toEditable(strips: MaliHafizaStrip[]): EditableStrip[] {
  return strips.map((s, i) => ({
    label: s.label || `Şerit ${i + 1}`,
    vatRate: '',
    paymentType: '',
    readable: s.readable,
    issue: s.issue,
    entries: s.entries.map((e) => ({
      documentNo: e.documentNo,
      documentDate: e.documentDate,
      totalAmount: String(e.totalAmount),
      taxAmount: String(e.taxAmount),
      uncertain: e.uncertain,
    })),
  }));
}

/**
 * Mali Hafıza Raporu — Evrak Dijitalleştir sayfasına gömülü özel akış. Evrak Kayıt'tan
 * yüklenmiş bir "Mali Hafıza Raporu" fotoğrafı burada analiz edilir; analiz VE kayıt adımları
 * arka planda (backend'de, HTTP isteğinden bağımsız) çalışır — kullanıcı sayfadan
 * ayrılsa/başka bir sayfaya geçse bile iş devam eder, bitince bildirim zilinden görülüp
 * tıklanarak buraya geri dönülebilir (bkz. `useMaliHafizaJobStatus`, `NotificationBell`).
 *
 * Tek bir fotoğrafta yan yana birden fazla ayrı fiş şeridi (farklı POS cihazlarına ait)
 * olabilir. Gemini her şeridi + şeritteki her günü ayrı ayrı çıkarır; kullanıcı gözden
 * geçirip her şerit için ortak bir KDV oranı ve ödeme türü seçer (şerit satırlarında bu
 * ikisi tek tek basılı değildir) — hızlı kullanım için en üstte kompakt bir seçim paneli +
 * Onayla butonu var, ayrıntılı gün gün tablo altta. Kaydedince her gün kendi z_raporu
 * evrağı, her şerit TAZE bir fiş grubu olarak oluşur; kaynak evrak da tamamlanmış işaretlenir.
 */
export function MaliHafizaPanel({ taxpayerId, documentTypes, doc, onDigitized }: Props) {
  const { user } = useAuth();
  const zRaporuType = documentTypes.find((t) => t.code === 'z_raporu');
  const { status, refresh } = useMaliHafizaJobStatus(taxpayerId);

  const [committing, setCommitting] = useState(false);
  const [strips, setStrips] = useState<EditableStrip[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'warning'; text: string } | null>(null);
  const initedJobIdRef = useRef<string | null>(null);
  const handledDoneJobIdRef = useRef<string | null>(null);

  const jobStatus = status && status.status !== 'idle' ? status : null;
  // Zil panelindeki iş bu sayfada önizlenen evrağa mı ait, yoksa (kullanıcı sıradan başka
  // bir Mali Hafıza Raporu'na tıkladıysa ya da bildirimden farklı bir evrağa geldiyse) başka
  // bir evrağa mı — buna göre "Analiz Et" mi yoksa inceleme paneli mi gösterileceği değişir.
  const jobIsForThisDoc = jobStatus?.sourceDocumentId === doc.id;

  // Kullanıcı kuyruktan başka bir evrağa geçtiğinde önceki evrağın inceleme verisi/mesajı
  // görünmeye devam etmesin — sıfırlanır; ait olduğu iş varsa aşağıdaki efekt yeniden doldurur.
  useEffect(() => {
    setStrips(null);
    setMsg(null);
    initedJobIdRef.current = null;
    handledDoneJobIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    if (!jobStatus || !jobIsForThisDoc) return;
    if (jobStatus.status === 'ready' && jobStatus.strips && initedJobIdRef.current !== jobStatus.jobId) {
      initedJobIdRef.current = jobStatus.jobId;
      setStrips(toEditable(jobStatus.strips));
      setMsg(jobStatus.resolutionWarning ? { kind: 'warning', text: jobStatus.resolutionWarning } : null);
    }
    if (jobStatus.status === 'done' && handledDoneJobIdRef.current !== jobStatus.jobId) {
      handledDoneJobIdRef.current = jobStatus.jobId;
      setStrips(null);
      onDigitized();
    }
    if (jobStatus.status === 'error' && handledDoneJobIdRef.current !== jobStatus.jobId) {
      handledDoneJobIdRef.current = jobStatus.jobId;
      setMsg({ kind: 'error', text: jobStatus.errorMessage || 'Bir hata oluştu.' });
      // Hata kayıt (Onayla) adımında oluştuysa (ör. kota dolması) analiz sonucu (strips)
      // hâlâ backend'de duruyor — kullanıcı sayfayı yenilese/tekrar gelse bile doldurma
      // panelini yeniden gösterip kota tahsis edildikten sonra tekrar Onayla'ya izin ver.
      if (jobStatus.strips && initedJobIdRef.current !== jobStatus.jobId) {
        initedJobIdRef.current = jobStatus.jobId;
        setStrips(toEditable(jobStatus.strips));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobStatus, jobIsForThisDoc]);

  if (!user) return null;

  function updateStrip(si: number, patch: Partial<EditableStrip>) {
    setStrips((prev) => prev && prev.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  }
  /** Kullanıcı bir satırı elle düzenlerse, artık gözden geçirilmiş sayılır — "belirsiz" uyarısı kalkar. */
  function updateEntry(si: number, ei: number, patch: Partial<EditableEntry>) {
    setStrips((prev) => prev && prev.map((s, i) => (
      i !== si ? s : { ...s, entries: s.entries.map((e, j) => (j === ei ? { ...e, ...patch, uncertain: false } : e)) }
    )));
  }
  function removeEntry(si: number, ei: number) {
    setStrips((prev) => prev && prev.map((s, i) => (i !== si ? s : { ...s, entries: s.entries.filter((_, j) => j !== ei) })));
  }
  function addEntry(si: number) {
    setStrips((prev) => prev && prev.map((s, i) => (
      i !== si ? s : { ...s, entries: [...s.entries, { documentNo: '', documentDate: '', totalAmount: '', taxAmount: '', uncertain: false }] }
    )));
  }
  function removeStrip(si: number) {
    setStrips((prev) => prev && prev.filter((_, i) => i !== si));
  }

  const readyToSave = !!strips?.length && strips.every((s) => (
    s.vatRate && s.paymentType && s.entries.length > 0
    && s.entries.every((e) => e.documentNo.trim() && e.documentDate && e.totalAmount !== '' && Number(e.totalAmount) >= 0)
  ));

  async function onayla() {
    if (!taxpayerId || !strips) return;
    setMsg(null);
    setCommitting(true);
    try {
      await apiPost('/documents/mali-hafiza/jobs/commit', {
        taxpayerId,
        strips: strips.map((s) => ({
          label: s.label,
          vatRate: s.vatRate,
          paymentType: s.paymentType,
          entries: s.entries.map((e) => ({
            documentNo: e.documentNo.trim(),
            documentDate: e.documentDate,
            totalAmount: Number(e.totalAmount),
            taxAmount: Number(e.taxAmount) || 0,
          })),
        })),
      });
      setMsg({ kind: 'success', text: 'Kaydediliyor — sayfadan ayrılabilirsiniz, bittiğinde bildirim alacaksınız.' });
      refresh();
    } catch (e) {
      setMsg({ kind: 'error', text: apiError(e) });
    } finally {
      setCommitting(false);
    }
  }

  const analyzing = jobIsForThisDoc && jobStatus?.status === 'analyzing';
  const saving = jobIsForThisDoc && jobStatus?.status === 'saving';
  const busyElsewhere = jobStatus && !jobIsForThisDoc && (jobStatus.status === 'analyzing' || jobStatus.status === 'saving');

  return (
    <div className="card mali-hafiza-panel">
      <p className="muted" style={{ marginTop: 0 }}>
        Görselde yan yana birden fazla ayrı şerit (farklı POS cihazlarına ait) olabilir, her biri ayrı bir
        Z-Raporu fiş grubu olarak kaydedilir. Şeritteki her gün için tek bir ortak KDV oranı ve ödeme türü
        seçmeniz yeterli.
      </p>

      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      {busyElsewhere && (
        <div className="alert warning">
          Bu mükellef için başka bir Mali Hafıza Raporu ({jobStatus.fileName}) şu anda işleniyor — bitmesini bekleyin.
        </div>
      )}
      {analyzing && (
        <div className="alert warning">AI ile taranıyor… Sayfadan ayrılabilirsiniz, bittiğinde bildirim alacaksınız.</div>
      )}
      {saving && (
        <div className="alert warning">Kaydediliyor… Sayfadan ayrılabilirsiniz, bittiğinde bildirim alacaksınız.</div>
      )}

      {jobIsForThisDoc && jobStatus?.status === 'done' && jobStatus.commitResult && zRaporuType && (
        <div className="mali-hafiza-result">
          <p><strong>{jobStatus.commitResult.totalDocuments} adet Z-Raporu kaydı, {jobStatus.commitResult.groups.length} yeni fiş grubunda oluşturuldu.</strong></p>
          <ul>
            {jobStatus.commitResult.groups.map((g) => (
              <li key={g.groupNo}>
                <Link to={`${homePathFor(user.role)}/evraklar/grup/${zRaporuType.id}/${encodeURIComponent(g.groupNo)}`}>
                  Fiş Grup: {g.groupNo}
                </Link>
                {' '}— {g.count} gün, {fmt(g.totalAmount)} TL
              </li>
            ))}
          </ul>
        </div>
      )}

      {!strips && !analyzing && !saving && !busyElsewhere && !(jobIsForThisDoc && jobStatus?.status === 'done') && (
        <p className="hint" style={{ marginTop: 0 }}>
          Bu evrağı AI ile analiz etmek için soldaki "Sırada Bekleyen" listesinde önündeki kutuyu işaretleyip
          "Otomatik Modu Başlat" (ya da yalnızca bunu işaretlediyseniz "Seçili Evrağı Başlat") ile başlatın.
          Analiz tamamlandığında bu evrak sırada kalır; buraya dönüp KDV oranı ve ödeme türünü seçip onaylarsınız.
        </p>
      )}

      {strips && strips.length > 0 && (
        <>
          {/* Hızlı onay paneli — tüm şerit ayrıntılarına inmeden, yalnızca her şerit için ortak
              KDV oranı + ödeme türü seçip tek tıkla onaylamak isteyenler için. */}
          <div className="mali-hafiza-quick-panel">
            <h4>Hızlı Onay</h4>
            <div className="mali-hafiza-quick-rows">
              {strips.map((strip, si) => (
                <div className="mali-hafiza-quick-row" key={si}>
                  <span className="mali-hafiza-quick-label">Fiş {si + 1}</span>
                  <select value={strip.vatRate} required onChange={(e) => updateStrip(si, { vatRate: e.target.value as MaliHafizaVatRate })}>
                    <option value="">KDV Oranı —</option>
                    {(Object.keys(MALI_HAFIZA_VAT_RATE_LABELS) as MaliHafizaVatRate[]).map((r) => (
                      <option key={r} value={r}>{MALI_HAFIZA_VAT_RATE_LABELS[r]}</option>
                    ))}
                  </select>
                  <select value={strip.paymentType} required
                    onChange={(e) => updateStrip(si, { paymentType: e.target.value as MaliHafizaPaymentType })}>
                    <option value="">Ödeme Türü —</option>
                    {(Object.keys(MALI_HAFIZA_PAYMENT_TYPE_LABELS) as MaliHafizaPaymentType[]).map((p) => (
                      <option key={p} value={p}>{MALI_HAFIZA_PAYMENT_TYPE_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button type="button" className="btn" disabled={!readyToSave || committing || saving} onClick={onayla}>
              {committing || saving ? 'Kaydediliyor…' : `Onayla (${strips.reduce((s, x) => s + x.entries.length, 0)} gün)`}
            </button>
          </div>

          {strips.map((strip, si) => {
            const total = strip.entries.reduce((s, e) => s + (Number(e.totalAmount) || 0), 0);
            const hasUncertainEntries = strip.entries.some((e) => e.uncertain);
            return (
              <div className="card mali-hafiza-strip-card" key={si}>
                {!strip.readable && (
                  <div className="alert error">
                    Bu şeridin fotoğrafı yeterince net değil, rakamların çoğu güvenle okunamadı.
                    {strip.issue ? ` ${strip.issue}` : ''} Aşağıdaki satırları dikkatle kontrol edin, gerekiyorsa fotoğrafı
                    bakarak elle düzeltin ya da bu şeridi kaldırıp daha net bir fotoğrafla tekrar deneyin.
                  </div>
                )}
                {strip.readable && strip.issue && (
                  <div className="alert warning">{strip.issue}</div>
                )}
                {strip.readable && !strip.issue && hasUncertainEntries && (
                  <div className="alert warning">Sarı renkle işaretli satırların rakamlarından AI emin değil — kaydetmeden önce kontrol edin.</div>
                )}
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <div className="field">
                    <label>Şerit Etiketi</label>
                    <input value={strip.label} onChange={(e) => updateStrip(si, { label: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>KDV Oranı <span className="req">*</span></label>
                    <select value={strip.vatRate} required onChange={(e) => updateStrip(si, { vatRate: e.target.value as MaliHafizaVatRate })}>
                      <option value="">— Seçin —</option>
                      {(Object.keys(MALI_HAFIZA_VAT_RATE_LABELS) as MaliHafizaVatRate[]).map((r) => (
                        <option key={r} value={r}>{MALI_HAFIZA_VAT_RATE_LABELS[r]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Ödeme Türü <span className="req">*</span></label>
                    <select value={strip.paymentType} required
                      onChange={(e) => updateStrip(si, { paymentType: e.target.value as MaliHafizaPaymentType })}>
                      <option value="">— Seçin —</option>
                      {(Object.keys(MALI_HAFIZA_PAYMENT_TYPE_LABELS) as MaliHafizaPaymentType[]).map((p) => (
                        <option key={p} value={p}>{MALI_HAFIZA_PAYMENT_TYPE_LABELS[p]}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="btn secondary" onClick={() => removeStrip(si)}>Şeridi Kaldır</button>
                </div>

                <div className="table-wrap">
                  <table className="compact">
                    <thead>
                      <tr><th>Z No</th><th>Tarih</th><th>Toplam</th><th>KDV</th><th></th></tr>
                    </thead>
                    <tbody>
                      {strip.entries.map((entry, ei) => (
                        <tr key={ei} className={entry.uncertain ? 'row-uncertain' : undefined}>
                          <td><input value={entry.documentNo} style={{ width: '5rem' }}
                            onChange={(e) => updateEntry(si, ei, { documentNo: e.target.value })} /></td>
                          <td><DateInput value={entry.documentDate} onChange={(v) => updateEntry(si, ei, { documentDate: v })} /></td>
                          <td><input type="number" step="0.01" value={entry.totalAmount} style={{ width: '7rem' }}
                            onChange={(e) => updateEntry(si, ei, { totalAmount: e.target.value })} /></td>
                          <td><input type="number" step="0.01" value={entry.taxAmount} style={{ width: '7rem' }}
                            onChange={(e) => updateEntry(si, ei, { taxAmount: e.target.value })} /></td>
                          <td>
                            <button type="button" className="icon-btn danger" title="Satırı sil" onClick={() => removeEntry(si, ei)}>
                              <XIcon />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" className="btn secondary" onClick={() => addEntry(si)}>Satır Ekle</button>
                  <span className="muted">{strip.entries.length} gün — Toplam {fmt(total)}</span>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
