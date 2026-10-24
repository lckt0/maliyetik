import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiError, apiGet } from '../api/client';
import { useAuth } from '../auth';
import { useDocumentTypes } from '../hooks';
import { DateInput } from '../components/DateInput';
import { VatPeriodsSummary, VatSummary } from '../types';
import { PageIntro } from '../components/PageIntro';
import { PercentIcon } from '../components/Icons';

function pad(n: number) { return String(n).padStart(2, '0'); }
function monthStart(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; }
function monthEnd(d: Date) {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(last)}`;
}
function formatTl(n: number) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function KdvHesaplama() {
  const { user, activeTaxpayerId } = useAuth();
  const types = useDocumentTypes();
  // Z-Raporu gibi türlerde `taxAmount` alanı formda yok, %10/%20 KDV alanlarından
  // otomatik hesaplanıp kaydediliyor (bkz. backend `applyDerivedMetadata`) — bu yüzden
  // türü de KDV Hesaplama listesine dahil etmek için o alanları da eşleştiriyoruz.
  const vatTypes = useMemo(
    () => types.filter((t) => t.metadataSchema?.fields?.some(
      (f) => f.key === 'taxAmount' || f.key === 'vat10TaxAmount' || f.key === 'vat20TaxAmount',
    )),
    [types],
  );

  const [dateFrom, setDateFrom] = useState(() => monthStart(new Date()));
  const [dateTo, setDateTo] = useState(() => monthEnd(new Date()));
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [summary, setSummary] = useState<VatSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [periods, setPeriods] = useState<VatPeriodsSummary | null>(null);

  // Türler yüklenince varsayılan olarak hepsi seçili gelsin.
  useEffect(() => {
    if (vatTypes.length && selectedTypes.length === 0) setSelectedTypes(vatTypes.map((t) => t.id));
    // eslint-disable-next-line
  }, [vatTypes]);

  function toggleType(id: number) {
    setSelectedTypes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const blocked = user?.role === 'accountant' && !activeTaxpayerId;

  useEffect(() => {
    if (blocked || !dateFrom || !dateTo || selectedTypes.length === 0) { setSummary(null); return; }
    setLoading(true); setError('');
    const params: Record<string, string> = { dateFrom, dateTo, documentTypeIds: selectedTypes.join(',') };
    if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
    apiGet<VatSummary>('/documents/vat-summary', params)
      .then(setSummary)
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, selectedTypes, activeTaxpayerId, blocked]);

  useEffect(() => {
    if (blocked || selectedTypes.length === 0) { setPeriods(null); return; }
    const params: Record<string, string> = { documentTypeIds: selectedTypes.join(',') };
    if (activeTaxpayerId) params.taxpayerId = activeTaxpayerId;
    apiGet<VatPeriodsSummary>('/documents/vat-periods', params)
      .then(setPeriods)
      .catch(() => setPeriods(null));
  }, [selectedTypes, activeTaxpayerId, blocked]);

  if (blocked) {
    return (
      <div className="card">
        <p>Devam etmek için önce üst bardan bir mükellef seçin.</p>
        <Link className="btn" to="/musavir/mukellefler">Mükelleflerime Git</Link>
      </div>
    );
  }

  return (
    <>
      <PageIntro icon={<PercentIcon />} title="KDV Hesaplama">
        Seçtiğiniz tarih aralığında, işaretlediğiniz evrak türlerindeki toplam KDV'yi hesaplar
        ve dönem dönem devreden KDV'yi çıkarır. Yalnızca alanları tamamlanmış (dijitalleştirilmiş)
        evraklar hesaba girer — eksik evraklarınız varsa önce Evrak Dijitalleştir&apos;i tamamlayın.
      </PageIntro>

      {periods && (
        <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
          <div className="card">
            <h3>Devreden KDV</h3>
            <div className="stat small">{formatTl(periods.carriedOver)} ₺</div>
            <span className="hint">Bu aya devreden indirilecek KDV fazlası</span>
          </div>
          <div className="card">
            <h3>Geçen Ay KDV'si</h3>
            <div className={`stat small ${periods.lastMonth.net > 0 ? 'text-danger' : periods.lastMonth.net < 0 ? 'text-success' : ''}`}>
              {formatTl(Math.abs(periods.lastMonth.net))} ₺
            </div>
            <span className="hint">{periods.lastMonth.net > 0 ? 'Ödenecek KDV' : periods.lastMonth.net < 0 ? 'Devreden/alacak KDV' : 'Net KDV yok'}</span>
          </div>
          <div className="card">
            <h3>Bu Ay KDV'si</h3>
            <div className={`stat small ${periods.thisMonth.net > 0 ? 'text-danger' : periods.thisMonth.net < 0 ? 'text-success' : ''}`}>
              {formatTl(Math.abs(periods.thisMonth.net))} ₺
            </div>
            <span className="hint">{periods.thisMonth.net > 0 ? 'Ödenecek KDV' : periods.thisMonth.net < 0 ? 'Devreden/alacak KDV' : 'Net KDV yok'}</span>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="toolbar" style={{ marginBottom: '1rem' }}>
          <div className="field"><label>Başlangıç Tarihi</label>
            <DateInput value={dateFrom} onChange={setDateFrom} /></div>
          <div className="field"><label>Bitiş Tarihi</label>
            <DateInput value={dateTo} onChange={setDateTo} /></div>
        </div>

        <label style={{ display: 'block', fontWeight: 600, marginBottom: '.4rem', fontSize: '.82rem' }}>
          Evrak Türleri
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
          {vatTypes.map((t) => (
            <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontWeight: 400 }}>
              <input type="checkbox" style={{ width: 'auto' }}
                checked={selectedTypes.includes(t.id)} onChange={() => toggleType(t.id)} />
              {t.name}
            </label>
          ))}
          {vatTypes.length === 0 && <span className="muted">Yükleniyor…</span>}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <h3>Toplam KDV</h3>
          <div className="stat">{loading ? '…' : `${formatTl(summary?.total ?? 0)} ₺`}</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Evrak Türü</th><th>Adet</th><th>Toplam KDV</th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={3} className="muted">Hesaplanıyor…</td></tr>}
            {!loading && (!summary || summary.byType.length === 0) && (
              <tr><td colSpan={3} className="muted">Seçilen aralıkta kayıt yok.</td></tr>
            )}
            {!loading && summary?.byType.map((row) => (
              <tr key={row.documentTypeId}>
                <td>{row.typeName}</td>
                <td>{row.count}</td>
                <td>{formatTl(row.total)} ₺</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
