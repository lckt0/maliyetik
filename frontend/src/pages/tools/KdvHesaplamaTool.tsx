import { useMemo, useState } from 'react';
import { ToolPageLayout } from '../../components/ToolPageLayout';
import { useSeoMeta } from '../../hooks';

function fmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const RATES = [1, 10, 20];

export function KdvHesaplamaTool() {
  useSeoMeta({
    title: 'KDV Hesaplama — Ücretsiz KDV Dahil/Hariç Hesaplama Aracı | Maliyetik',
    description: 'KDV dahil veya KDV hariç tutarı saniyeler içinde hesaplayın. %1, %10 ve %20 KDV oranlarıyla ücretsiz online KDV hesaplama aracı.',
    path: '/araclar/kdv-hesaplama',
  });

  const [amount, setAmount] = useState('1000');
  const [rate, setRate] = useState(20);
  const [mode, setMode] = useState<'exclusive' | 'inclusive'>('exclusive');

  const result = useMemo(() => {
    const a = Number(amount.replace(',', '.'));
    if (!a || a < 0) return null;
    if (mode === 'exclusive') {
      const vat = a * (rate / 100);
      return { base: a, vat, total: a + vat };
    }
    const base = a / (1 + rate / 100);
    const vat = a - base;
    return { base, vat, total: a };
  }, [amount, rate, mode]);

  return (
    <ToolPageLayout>
      <h1>KDV Hesaplama</h1>
      <p className="muted">
        Tutarınızı girin, KDV oranını seçin ve KDV dahil/hariç tutarları anında hesaplayın.
        Türkiye'de en sık kullanılan %1, %10 ve %20 KDV oranlarını destekler.
      </p>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="field">
          <label>Hesaplama Türü</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="exclusive">KDV Hariç Tutardan Hesapla</option>
            <option value="inclusive">KDV Dahil Tutardan Hesapla</option>
          </select>
        </div>
        <div className="field">
          <label>{mode === 'exclusive' ? 'KDV Hariç Tutar' : 'KDV Dahil Tutar'} (₺)</label>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>KDV Oranı</label>
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {RATES.map((r) => <option key={r} value={r}>%{r}</option>)}
          </select>
        </div>
      </div>

      {result && (
        <div className="grid cols-3" style={{ marginTop: '1.5rem' }}>
          <div className="card">
            <h3>KDV Hariç Tutar</h3>
            <div className="stat small">{fmt(result.base)} ₺</div>
          </div>
          <div className="card">
            <h3>KDV Tutarı (%{rate})</h3>
            <div className="stat small">{fmt(result.vat)} ₺</div>
          </div>
          <div className="card">
            <h3>KDV Dahil Tutar</h3>
            <div className="stat small">{fmt(result.total)} ₺</div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>KDV Nasıl Hesaplanır?</h3>
        <p className="muted" style={{ margin: 0 }}>
          <b>KDV hariç tutardan:</b> KDV tutarı = Tutar × Oran / 100. KDV dahil tutar = Tutar + KDV tutarı.<br />
          <b>KDV dahil tutardan:</b> KDV hariç tutar = Tutar / (1 + Oran / 100). KDV tutarı = Dahil tutar − Hariç tutar.
        </p>
      </div>
    </ToolPageLayout>
  );
}
