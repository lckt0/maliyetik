import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiError, apiGet, apiPatch } from '../../api/client';
import { useAuth } from '../../auth';
import { useDocumentTypes, useReceiptGroups } from '../../hooks';
import { useDialog } from '../../components/DialogProvider';
import { DownloadIcon, ExportIcon } from '../../components/Icons';
import { Spinner } from '../../components/Spinner';
import { downloadLucaWorkbook, lineBalance, planLucaLines, LucaJournalLine } from '../../utils/lucaExport';
import { isoToDisplay } from '../../utils/date';
import { DocumentRow, GroupSummary, LucaAccountCodes, LucaSettings, Paginated } from '../../types';

/** Form yalnızca hesap kodu alanlarını tutar — `id`/`companyTitle` sunucuda kalır. */
type LucaSettingsForm = LucaAccountCodes;

/** `/documents` ucunun izin verdiği en büyük sayfa boyutu (bkz. PageQueryDto). */
const PAGE_SIZE = 100;
/** Tek fiş grubu için çekilecek azami sayfa — 5000 evrak, gerçekçi bir grubun çok üstünde. */
const MAX_EXPORT_PAGES = 50;

const EMPTY_FORM: LucaSettingsForm = {
  lucaKasaHesapKodu: '', lucaKrediKartiHesapKodu: '', lucaYemekKartiHesapKodu: '',
  lucaKdv0ToplamHesapKodu: '', lucaKdv10ToplamHesapKodu: '', lucaKdv10HesaplananHesapKodu: '',
  lucaKdv20ToplamHesapKodu: '', lucaKdv20HesaplananHesapKodu: '', lucaBelgeTuru: '',
};

const ACCOUNT_FIELDS: { key: keyof LucaSettingsForm; label: string; placeholder: string }[] = [
  { key: 'lucaKasaHesapKodu', label: 'Kasa Hesap Kodu', placeholder: 'ör. 100' },
  { key: 'lucaKrediKartiHesapKodu', label: 'Kredi Kartı Hesap Kodu', placeholder: 'ör. 108.01' },
  { key: 'lucaYemekKartiHesapKodu', label: 'Yemek Kartı Hesap Kodu', placeholder: 'ör. 108.02' },
  { key: 'lucaKdv0ToplamHesapKodu', label: '%0 KDV Toplam Hesap Kodu', placeholder: 'ör. 600.00' },
  { key: 'lucaKdv10ToplamHesapKodu', label: '%10 KDV Toplam Hesap Kodu', placeholder: 'ör. 600.10' },
  { key: 'lucaKdv10HesaplananHesapKodu', label: '%10 KDV Hesaplanan Hesap Kodu', placeholder: 'ör. 391.10' },
  { key: 'lucaKdv20ToplamHesapKodu', label: '%20 KDV Toplam Hesap Kodu', placeholder: 'ör. 600.20' },
  { key: 'lucaKdv20HesaplananHesapKodu', label: '%20 KDV Hesaplanan Hesap Kodu', placeholder: 'ör. 391.20' },
  { key: 'lucaBelgeTuru', label: 'Belge Türü (opsiyonel)', placeholder: "Luca'daki kod" },
];

function money(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Dışa Aktar — bir Z-Raporu Fiş Grubu'nu Luca'nın toplu "Fiş Aktarım" Excel şablonuna uygun
 * TEK muhasebe fişi olarak indirir. Fişin satırları grup toplamından değil, gruptaki HER
 * Z-Raporu'ndan ayrı ayrı üretilir (Evrak No = Z No, Evrak Tarihi = Z tarihi) — böylece
 * hangi tutarın hangi güne ait olduğu Luca'da da görünür.
 *
 * Hesap kodları mükellef başına değiştiğinden (bkz. TaxpayersController#getLucaSettings)
 * aynı sayfada düzenlenir. İndirmeden önce satırlar ekranda önizlenir.
 */
export function ExportHub() {
  const { activeTaxpayerId } = useAuth();
  const { alert: alertDialog } = useDialog();
  const documentTypes = useDocumentTypes();
  const zRaporuType = documentTypes.find((t) => t.code === 'z_raporu');
  const groups = useReceiptGroups(zRaporuType?.id, activeTaxpayerId);

  const [groupNo, setGroupNo] = useState('');
  const [summary, setSummary] = useState<GroupSummary | null>(null);

  const [form, setForm] = useState<LucaSettingsForm>(EMPTY_FORM);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [docs, setDocs] = useState<DocumentRow[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    if (!activeTaxpayerId) return;
    setSettingsLoading(true);
    apiGet<LucaSettings>(`/taxpayers/${activeTaxpayerId}/luca-settings`)
      .then((s) => setForm({
        lucaKasaHesapKodu: s.lucaKasaHesapKodu ?? '',
        lucaKrediKartiHesapKodu: s.lucaKrediKartiHesapKodu ?? '',
        lucaYemekKartiHesapKodu: s.lucaYemekKartiHesapKodu ?? '',
        lucaKdv0ToplamHesapKodu: s.lucaKdv0ToplamHesapKodu ?? '',
        lucaKdv10ToplamHesapKodu: s.lucaKdv10ToplamHesapKodu ?? '',
        lucaKdv10HesaplananHesapKodu: s.lucaKdv10HesaplananHesapKodu ?? '',
        lucaKdv20ToplamHesapKodu: s.lucaKdv20ToplamHesapKodu ?? '',
        lucaKdv20HesaplananHesapKodu: s.lucaKdv20HesaplananHesapKodu ?? '',
        lucaBelgeTuru: s.lucaBelgeTuru ?? '',
      }))
      .catch(() => setForm(EMPTY_FORM))
      .finally(() => setSettingsLoading(false));
    setGroupNo('');
    setSummary(null);
    setDocs(null);
  }, [activeTaxpayerId]);

  useEffect(() => {
    if (!groupNo || !zRaporuType || !activeTaxpayerId) { setSummary(null); return; }
    apiGet<GroupSummary>('/documents/group-summary', { documentTypeId: zRaporuType.id, groupNo, taxpayerId: activeTaxpayerId })
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [groupNo, zRaporuType, activeTaxpayerId]);

  const typeId = zRaporuType?.id;

  /** Fiş grubundaki tüm Z-Raporlarını sayfa sayfa çeker — önizleme ve dosya aynı veriyi kullanır. */
  const loadDocs = useCallback(async () => {
    if (!typeId || !groupNo || !activeTaxpayerId) { setDocs(null); return; }
    setDocsLoading(true);
    setExportError('');
    try {
      // `/documents` limit en fazla 100 (bkz. PageQueryDto) — 100'den büyük bir Fiş
      // Grubu'nda (ör. yıllık Mali Hafıza içe aktarımı) tek istek yetmeyebilir, tüm
      // sayfalar bitene kadar döngüyle çekilir.
      const items: DocumentRow[] = [];
      for (let page = 1; page <= MAX_EXPORT_PAGES; page += 1) {
        const res = await apiGet<Paginated<DocumentRow>>('/documents', {
          documentTypeId: typeId, groupNo, taxpayerId: activeTaxpayerId, limit: PAGE_SIZE, page,
        });
        items.push(...res.items);
        if (res.items.length < PAGE_SIZE) break;
        // Son sayfa hep dolu gelirse döngü sınıra dayanır; sessizce eksik dosya
        // üretmek yerine kullanıcıya bildiriyoruz.
        if (page === MAX_EXPORT_PAGES) {
          throw new Error('Fiş grubu beklenenden büyük, dışa aktarılamadı. Lütfen destek ile iletişime geçin.');
        }
      }
      setDocs(items);
    } catch (err) {
      setDocs(null);
      setExportError(apiError(err));
    } finally {
      setDocsLoading(false);
    }
  }, [typeId, groupNo, activeTaxpayerId]);

  useEffect(() => { void loadDocs(); }, [loadDocs]);

  const plan = useMemo(() => (docs ? planLucaLines(docs, form) : null), [docs, form]);
  const balance = useMemo(() => (plan ? lineBalance(plan.lines) : null), [plan]);

  /** Önizleme tablosunu Z-Raporu bazında öbekler — her Z No kendi satır kümesiyle görünür. */
  const previewGroups = useMemo(() => {
    if (!plan) return [];
    const out: { evrakNo: string; evrakTarihi: string; lines: LucaJournalLine[] }[] = [];
    for (const line of plan.lines) {
      const last = out[out.length - 1];
      if (last && last.evrakNo === line.evrakNo && last.evrakTarihi === line.evrakTarihi) last.lines.push(line);
      else out.push({ evrakNo: line.evrakNo, evrakTarihi: line.evrakTarihi, lines: [line] });
    }
    return out;
  }, [plan]);

  const missingRequired = ACCOUNT_FIELDS.filter((f) => f.key !== 'lucaBelgeTuru' && !form[f.key]).length;

  if (!activeTaxpayerId) {
    return (
      <div className="card">
        <p>Devam etmek için önce bir mükellef seçin.</p>
        <Link className="btn" to="/musavir/mukellefler">Mükelleflerime Git</Link>
      </div>
    );
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsError('');
    setSettingsSaved(false);
    try {
      await apiPatch<LucaSettings>(`/taxpayers/${activeTaxpayerId}/luca-settings`, form);
      setSettingsSaved(true);
    } catch (err) {
      setSettingsError(apiError(err));
    } finally {
      setSavingSettings(false);
    }
  }

  async function doExport() {
    if (!plan || !docs?.length) return;
    if (!plan.lines.length) { setExportError('Fiş grubunda dışa aktarılacak bir tutar bulunamadı.'); return; }
    if (plan.missingLabels.length) {
      setSettingsOpen(true);
      await alertDialog(`Aşağıdaki kalemler için hesap kodu tanımlı değil, önce "Luca Hesap Kodları" bölümünü doldurun:\n\n${plan.missingLabels.join('\n')}`);
      return;
    }
    const fisTarihi = isoToDisplay(summary?.dateTo ?? docs[0].documentDate) || '';
    downloadLucaWorkbook(groupNo, fisTarihi, plan.lines, form);
  }

  return (
    <div>
      <div className="section-head">
        <h2><ExportIcon /> Dışa Aktar</h2>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Bir Z-Raporu Fiş Grubu seçin; grup, Luca&apos;nın toplu &quot;Fiş Aktarım&quot; şablonuna uygun
        <b> tek muhasebe fişi</b> olarak indirilir. Fişin satırları gruptaki <b>her Z-Raporu için ayrı ayrı</b>
        {' '}yazılır — Evrak No = Z No, Evrak Tarihi = o raporun tarihi. İndirmeden önce tüm satırları aşağıda görebilirsiniz.
      </p>

      <details className="card" open={settingsOpen} onToggle={(e) => setSettingsOpen((e.target as HTMLDetailsElement).open)} style={{ marginBottom: '1.5rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          1. Luca Hesap Kodları{' '}
          {settingsLoading ? <span className="muted">— yükleniyor…</span>
            : missingRequired > 0
              ? <span className="badge revoked">{missingRequired} alan boş</span>
              : <span className="badge active">Tamam</span>}
        </summary>
        <form onSubmit={saveSettings}>
          <p className="hint">Bu mükellefin hesap planına göre — bir kez doldurmanız yeterli. Tutarı sıfır olan kalemler için kod gerekmez.</p>
          {settingsError && <div className="alert error">{settingsError}</div>}
          <div className="grid cols-3">
            {ACCOUNT_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <input value={form[f.key] ?? ''} disabled={settingsLoading} placeholder={f.placeholder}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button className="btn secondary" disabled={savingSettings || settingsLoading}>
              {savingSettings ? 'Kaydediliyor…' : 'Hesap Kodlarını Kaydet'}
            </button>
            {settingsSaved && <span className="muted">Kaydedildi.</span>}
          </div>
        </form>
      </details>

      <div className="card">
        <h3>2. Fiş Grubu Seç</h3>
        {exportError && <div className="alert error">{exportError}</div>}
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Fiş Grubu</label>
          <select value={groupNo} onChange={(e) => setGroupNo(e.target.value)}>
            <option value="">Seçin…</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {summary && groupNo && (
          <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
            <div className="card"><h3>Z-Raporu Adedi</h3><div className="stat small">{summary.count}</div></div>
            <div className="card"><h3>Toplam Tutar</h3>
              <div className="stat small">{money(summary.totalAmount)}</div></div>
            <div className="card"><h3>Fiş Tarihi</h3>
              <div className="stat small">{isoToDisplay(summary.dateTo) || '—'}</div>
              <p className="hint">Grubun son günü</p></div>
          </div>
        )}
      </div>

      {groupNo && (
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3>3. Fiş Önizleme</h3>
          {docsLoading && <Spinner label="Fiş grubu okunuyor…" />}

          {!docsLoading && plan && plan.lines.length === 0 && (
            <div className="alert">Bu fiş grubundaki Z-Raporlarında sıfırdan farklı bir tutar bulunamadı — önce Evrak Dijitalleştir&apos;den tutarları tamamlayın.</div>
          )}

          {!docsLoading && plan && plan.lines.length > 0 && (
            <>
              {plan.missingLabels.length > 0 && (
                <div className="alert error">
                  Şu kalemlerin hesap kodu tanımlı değil, dosya indirilemez:{' '}
                  <b>{plan.missingLabels.join(', ')}</b> — yukarıdaki <b>Luca Hesap Kodları</b> bölümünü doldurun.
                </div>
              )}
              {balance && !balance.balanced && (
                <div className="alert error">
                  Fiş dengesiz: Borç {money(balance.borc)} ≠ Alacak {money(balance.alacak)}. Luca dengesiz fişi
                  içe almaz — Z-Raporlarındaki tahsilat ve satış tutarlarını kontrol edin.
                </div>
              )}

              <p className="muted">
                <b>{previewGroups.length}</b> Z-Raporu · <b>{plan.lines.length}</b> satır ·
                {' '}Borç <b>{balance ? money(balance.borc) : '—'}</b> / Alacak <b>{balance ? money(balance.alacak) : '—'}</b>
                {balance?.balanced && <span className="badge active" style={{ marginLeft: 8 }}>Denk</span>}
              </p>

              <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table className="compact">
                  <thead>
                    <tr>
                      <th>Evrak No (Z No)</th><th>Evrak Tarihi</th><th>Hesap Kodu</th>
                      <th>Detay Açıklama</th><th style={{ textAlign: 'right' }}>Borç</th><th style={{ textAlign: 'right' }}>Alacak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewGroups.map((g) => g.lines.map((l, i) => (
                      <tr key={`${g.evrakNo}-${g.evrakTarihi}-${l.label}`}>
                        <td>{i === 0 ? (g.evrakNo || <span className="muted">— Z No yok —</span>) : ''}</td>
                        <td>{i === 0 ? g.evrakTarihi : ''}</td>
                        <td>{l.hesapKodu || <span className="badge revoked">eksik</span>}</td>
                        <td>{l.label}</td>
                        <td style={{ textAlign: 'right' }}>{l.side === 'borc' ? money(l.amount) : ''}</td>
                        <td style={{ textAlign: 'right' }}>{l.side === 'alacak' ? money(l.amount) : ''}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <button type="button" className="btn" disabled={plan.missingLabels.length > 0} onClick={doExport}>
                  <DownloadIcon /> Luca Excel Olarak İndir
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
