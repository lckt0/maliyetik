import { useMemo, useState } from 'react';
import { ToolPageLayout } from '../../components/ToolPageLayout';
import { useSeoMeta } from '../../hooks';

function fmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DesiHesaplamaTool() {
  useSeoMeta({
    title: 'Desi Hesaplama — Kargo Desi ve Hacim Ağırlığı Hesaplama Aracı | Maliyetik',
    description: 'Koli en, boy, yükseklik ölçülerinizi girerek kargo desi (hacimsel ağırlık) değerinizi ücretsiz hesaplayın. Kargo ücretinde esas alınacak ağırlığı öğrenin.',
    path: '/araclar/desi-hesaplama',
  });

  const [width, setWidth] = useState('30');
  const [length, setLength] = useState('40');
  const [height, setHeight] = useState('30');
  const [weight, setWeight] = useState('5');
  const [count, setCount] = useState('1');

  const result = useMemo(() => {
    const w = Number(width);
    const l = Number(length);
    const h = Number(height);
    const kg = Number(weight) || 0;
    const adet = Number(count) || 1;
    if (!w || !l || !h) return null;
    const desiPerPiece = (w * l * h) / 3000;
    const totalDesi = desiPerPiece * adet;
    const totalWeight = kg * adet;
    const billable = Math.max(totalDesi, totalWeight);
    return { desiPerPiece, totalDesi, totalWeight, billable };
  }, [width, length, height, weight, count]);

  return (
    <ToolPageLayout>
      <h1>Desi Hesaplama</h1>
      <p className="muted">
        Kargoda ücretlendirme, gerçek ağırlık ile hacimsel ağırlıktan (desi) hangisi büyükse ona göre
        yapılır. Koli ölçülerinizi girerek desi değerinizi ve faturalanacak ağırlığı hesaplayın.
      </p>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="row">
          <div className="field"><label>En (cm)</label><input inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} /></div>
          <div className="field"><label>Boy (cm)</label><input inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} /></div>
        </div>
        <div className="row">
          <div className="field"><label>Yükseklik (cm)</label><input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} /></div>
          <div className="field"><label>Gerçek Ağırlık (kg)</label><input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
        </div>
        <div className="field">
          <label>Koli Adedi</label>
          <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
      </div>

      {result && (
        <div className="grid cols-3" style={{ marginTop: '1.5rem' }}>
          <div className="card">
            <h3>Desi (Koli Başına)</h3>
            <div className="stat small">{fmt(result.desiPerPiece)}</div>
          </div>
          <div className="card">
            <h3>Toplam Desi</h3>
            <div className="stat small">{fmt(result.totalDesi)}</div>
          </div>
          <div className="card">
            <h3>Faturalanacak Ağırlık</h3>
            <div className="stat small">{fmt(result.billable)} kg/desi</div>
            <p className="muted" style={{ margin: 0, fontSize: '.78rem' }}>
              {result.totalDesi > result.totalWeight ? 'Hacimsel ağırlık (desi) esas alınır.' : 'Gerçek ağırlık esas alınır.'}
            </p>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3>Desi Nasıl Hesaplanır?</h3>
        <p className="muted" style={{ margin: 0 }}>
          Desi = (En × Boy × Yükseklik [cm]) / 3000. Kargo firmaları, gerçek ağırlık ile desi değerinden
          büyük olanı faturalandırma esası olarak kullanır. Bazı firmalar 3000 yerine farklı bir katsayı
          kullanabilir; kesin ücret için kargo firmanızın güncel tarifesini kontrol edin.
        </p>
      </div>
    </ToolPageLayout>
  );
}
