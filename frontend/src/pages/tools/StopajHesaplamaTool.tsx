import { useMemo, useState } from 'react';
import { ToolPageLayout } from '../../components/ToolPageLayout';
import { useSeoMeta } from '../../hooks';

function fmt(n: number): string {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PRESETS = [
  { code: 'kira', label: 'Kira Stopajı (GMSİ)', rate: 20 },
  { code: 'serbest_meslek', label: 'Serbest Meslek Erbabı Stopajı', rate: 20 },
  { code: 'insaat', label: 'Yıllara Yaygın İnşaat/Onarım İşleri', rate: 5 },
  { code: 'custom', label: 'Özel Oran Gir', rate: 0 },
];

export function StopajHesaplamaTool() {
  useSeoMeta({
    title: 'Stopaj Hesaplama — Gelir Vergisi Stopajı Hesaplama Aracı | Maliyetik',
    description: 'Kira, serbest meslek ve diğer ödemeleriniz için stopaj (vergi kesintisi) tutarını ve net ödemeyi ücretsiz hesaplayın.',
    path: '/araclar/stopaj-hesaplama',
  });

  const [amount, setAmount] = useState('10000');
  const [presetCode, setPresetCode] = useState('kira');
  const [customRate, setCustomRate] = useState('20');

  const rate = presetCode === 'custom' ? Number(customRate.replace(',', '.')) || 0 : PRESETS.find((p) => p.code === presetCode)!.rate;

  const result = useMemo(() => {
    const a = Number(amount.replace(',', '.'));
    if (!a || a < 0) return null;
    const withheld = a * (rate / 100);
    return { withheld, net: a - withheld };
  }, [amount, rate]);

  return (
    <ToolPageLayout>
      <h1>Stopaj Hesaplama</h1>
      <p className="muted">
        Kira, serbest meslek kazancı gibi ödemelerinizde kesilecek stopaj (gelir vergisi kesintisi)
        tutarını ve elinize geçecek net tutarı hesaplayın.
      </p>
      <div className="alert warning">
        Aşağıdaki oranlar en sık karşılaşılan genel oranlardır ve mükellefin durumuna göre değişebilir.
        Kesin oran için Gelir İdaresi Başkanlığı (gib.gov.tr) güncel tebliğlerini kontrol edin; farklı bir
        oran biliyorsanız "Özel Oran Gir" seçeneğiyle kendi oranınızı girebilirsiniz.
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="field">
          <label>Brüt Tutar (₺)</label>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Stopaj Türü</label>
          <select value={presetCode} onChange={(e) => setPresetCode(e.target.value)}>
            {PRESETS.map((p) => <option key={p.code} value={p.code}>{p.label}{p.code !== 'custom' ? ` (%${p.rate})` : ''}</option>)}
          </select>
        </div>
        {presetCode === 'custom' && (
          <div className="field">
            <label>Stopaj Oranı (%)</label>
            <input inputMode="decimal" value={customRate} onChange={(e) => setCustomRate(e.target.value)} />
          </div>
        )}
      </div>

      {result && (
        <div className="grid cols-3" style={{ marginTop: '1.5rem' }}>
          <div className="card">
            <h3>Brüt Tutar</h3>
            <div className="stat small">{fmt(Number(amount.replace(',', '.')) || 0)} ₺</div>
          </div>
          <div className="card">
            <h3>Stopaj Tutarı (%{rate})</h3>
            <div className="stat small">{fmt(result.withheld)} ₺</div>
          </div>
          <div className="card">
            <h3>Net Ödeme</h3>
            <div className="stat small">{fmt(result.net)} ₺</div>
          </div>
        </div>
      )}
    </ToolPageLayout>
  );
}
