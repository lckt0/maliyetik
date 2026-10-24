import { useMemo, useState } from 'react';
import { ToolPageLayout } from '../../components/ToolPageLayout';
import { useSeoMeta } from '../../hooks';

function fmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Row { month: number; installment: number; principal: number; interest: number; remaining: number; }

export function KrediHesaplamaTool() {
  useSeoMeta({
    title: 'Kredi Hesaplama — Aylık Taksit ve Faiz Hesaplama Aracı | Maliyetik',
    description: 'Kredi tutarı, vade ve faiz oranına göre aylık taksitinizi, toplam geri ödemenizi ve toplam faizinizi ücretsiz hesaplayın. Ödeme planı tablosuyla birlikte.',
    path: '/araclar/kredi-hesaplama',
  });

  const [principal, setPrincipal] = useState('100000');
  const [months, setMonths] = useState('12');
  const [monthlyRate, setMonthlyRate] = useState('3');
  const [showSchedule, setShowSchedule] = useState(false);

  const result = useMemo(() => {
    const p = Number(principal.replace(',', '.'));
    const n = Number(months);
    const r = Number(monthlyRate.replace(',', '.')) / 100;
    if (!p || p <= 0 || !n || n <= 0) return null;

    const installment = r > 0
      ? (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
      : p / n;

    const rows: Row[] = [];
    let remaining = p;
    for (let month = 1; month <= n; month++) {
      const interest = remaining * r;
      const principalPart = installment - interest;
      remaining = Math.max(0, remaining - principalPart);
      rows.push({ month, installment, principal: principalPart, interest, remaining });
    }
    const total = installment * n;
    return { installment, total, totalInterest: total - p, rows };
  }, [principal, months, monthlyRate]);

  return (
    <ToolPageLayout>
      <h1>Kredi Hesaplama</h1>
      <p className="muted">
        Kredi tutarı, vade ve aylık faiz oranınızı girin; aylık taksitinizi, toplam geri ödemenizi
        ve toplam faiz maliyetinizi hesaplayın.
      </p>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="field">
          <label>Kredi Tutarı (₺)</label>
          <input inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} />
        </div>
        <div className="row">
          <div className="field">
            <label>Vade (Ay)</label>
            <input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          </div>
          <div className="field">
            <label>Aylık Faiz Oranı (%)</label>
            <input inputMode="decimal" value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} />
          </div>
        </div>
      </div>

      {result && (
        <>
          <div className="grid cols-3" style={{ marginTop: '1.5rem' }}>
            <div className="card">
              <h3>Aylık Taksit</h3>
              <div className="stat small">{fmt(result.installment)} ₺</div>
            </div>
            <div className="card">
              <h3>Toplam Geri Ödeme</h3>
              <div className="stat small">{fmt(result.total)} ₺</div>
            </div>
            <div className="card">
              <h3>Toplam Faiz</h3>
              <div className="stat small">{fmt(result.totalInterest)} ₺</div>
            </div>
          </div>

          <div className="toolbar" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn secondary sm" onClick={() => setShowSchedule((v) => !v)}>
              {showSchedule ? 'Ödeme Planını Gizle' : 'Ödeme Planını Göster'}
            </button>
          </div>

          {showSchedule && (
            <div className="table-wrap">
              <table className="compact">
                <thead><tr><th>Ay</th><th>Taksit</th><th>Anapara</th><th>Faiz</th><th>Kalan Anapara</th></tr></thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{fmt(row.installment)} ₺</td>
                      <td>{fmt(row.principal)} ₺</td>
                      <td>{fmt(row.interest)} ₺</td>
                      <td>{fmt(row.remaining)} ₺</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Kredi Taksiti Nasıl Hesaplanır?</h3>
        <p className="muted" style={{ margin: 0 }}>
          Eşit taksitli (anüite) kredilerde aylık taksit: Taksit = Anapara × Oran × (1+Oran)ⁿ / ((1+Oran)ⁿ − 1)
          formülüyle hesaplanır. Bu araç yaklaşık bir hesaplama sunar; bankanızın uyguladığı komisyon,
          sigorta ve diğer masraflar dahil değildir.
        </p>
      </div>
    </ToolPageLayout>
  );
}
