import { useMemo, useState } from 'react';
import { ToolPageLayout } from '../../components/ToolPageLayout';
import { useSeoMeta } from '../../hooks';

function fmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Örnek/güncel olmayabilecek dilim yapısı — Türkiye'de gelir vergisi dilimleri her yıl yeniden
 * belirlenir. Kesin ve güncel dilimler için Gelir İdaresi Başkanlığı (gib.gov.tr) kontrol
 * edilmelidir; bu araç yalnızca yaklaşık/örnek bir hesaplama sunar.
 */
const BRACKETS = [
  { upTo: 158000, rate: 15 },
  { upTo: 330000, rate: 20 },
  { upTo: 800000, rate: 27 },
  { upTo: 4300000, rate: 35 },
  { upTo: Infinity, rate: 40 },
];

function calculate(income: number) {
  let remaining = income;
  let prevLimit = 0;
  let tax = 0;
  const breakdown: { from: number; to: number; rate: number; taxable: number; tax: number }[] = [];

  for (const bracket of BRACKETS) {
    if (remaining <= 0) break;
    const bandSize = bracket.upTo - prevLimit;
    const taxableInBand = Math.min(remaining, bandSize);
    const bandTax = taxableInBand * (bracket.rate / 100);
    if (taxableInBand > 0) {
      breakdown.push({ from: prevLimit, to: bracket.upTo, rate: bracket.rate, taxable: taxableInBand, tax: bandTax });
    }
    tax += bandTax;
    remaining -= taxableInBand;
    prevLimit = bracket.upTo;
  }
  return { tax, breakdown, effectiveRate: income > 0 ? (tax / income) * 100 : 0 };
}

export function GelirVergisiHesaplamaTool() {
  useSeoMeta({
    title: 'Gelir Vergisi Hesaplama — Dilimli Gelir Vergisi Hesaplama Aracı | Maliyetik',
    description: 'Yıllık gelirinize göre dilim dilim gelir vergisi tutarınızı ve efektif vergi oranınızı ücretsiz hesaplayın.',
    path: '/araclar/gelir-vergisi-hesaplama',
  });

  const [income, setIncome] = useState('600000');

  const result = useMemo(() => {
    const i = Number(income.replace(',', '.'));
    if (!i || i < 0) return null;
    return calculate(i);
  }, [income]);

  return (
    <ToolPageLayout>
      <h1>Gelir Vergisi Hesaplama</h1>
      <p className="muted">
        Yıllık vergiye tabi gelirinizi girin; dilim dilim gelir vergisi tutarınızı ve efektif (ortalama)
        vergi oranınızı hesaplayın.
      </p>
      <div className="alert warning">
        Gelir vergisi dilimleri her yıl yeniden belirlenir. Bu araçta kullanılan dilimler
        <b> örnek/yaklaşık</b> değerlerdir — kesin ve güncel dilimler için Gelir İdaresi Başkanlığı'nı
        (gib.gov.tr) kontrol edin.
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="field">
          <label>Yıllık Vergiye Tabi Gelir (₺)</label>
          <input inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
        </div>
      </div>

      {result && (
        <>
          <div className="grid cols-2" style={{ marginTop: '1.5rem' }}>
            <div className="card">
              <h3>Toplam Gelir Vergisi</h3>
              <div className="stat small">{fmt(result.tax)} ₺</div>
            </div>
            <div className="card">
              <h3>Efektif Vergi Oranı</h3>
              <div className="stat small">%{fmt(result.effectiveRate)}</div>
            </div>
          </div>

          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table className="compact">
              <thead><tr><th>Dilim</th><th>Oran</th><th>Vergiye Tabi Tutar</th><th>Vergi</th></tr></thead>
              <tbody>
                {result.breakdown.map((b, i) => (
                  <tr key={i}>
                    <td>{fmt(b.from)} — {b.to === Infinity ? '∞' : fmt(b.to)} ₺</td>
                    <td>%{b.rate}</td>
                    <td>{fmt(b.taxable)} ₺</td>
                    <td>{fmt(b.tax)} ₺</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ToolPageLayout>
  );
}
