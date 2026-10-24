import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useAuth, homePathFor } from '../auth';
import { useDataVersion } from '../dataBus';
import { AiInsightsResult, insightLink } from '../ai';
import { AlertCircleIcon, CheckCircleIcon, SparkleIcon } from './Icons';
import { MarkdownText } from './MarkdownText';

/**
 * Evrak akışındaki bulgular ve (yapay zeka açıksa) kısa dönem özeti.
 *
 * Bulgular sunucuda DETERMİNİSTİK olarak hesaplanır — atlanan fatura numarası, evraksız
 * ay, olağandışı tutar gibi sayılabilir olgular. Yapay zeka yalnızca bunları anlatan
 * özeti yazar; kapalıysa bulgular ham listesiyle görünmeye devam eder, panel boşalmaz.
 */
export function AiInsightsPanel({ taxpayerId }: { taxpayerId: string | null }) {
  const { user } = useAuth();
  const docsVersion = useDataVersion('documents');
  const [data, setData] = useState<AiInsightsResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taxpayerId) { setData(null); return; }
    setLoading(true);
    apiGet<AiInsightsResult>('/ai-assist/insights', { taxpayerId })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [taxpayerId, docsVersion]);

  if (!taxpayerId) return null;

  const base = user ? homePathFor(user.role) : '/mukellef';

  return (
    <div className="card">
      <h3><SparkleIcon /> Evrak Akışı Bulguları</h3>

      {loading && <p className="muted" style={{ margin: 0 }}>Kontrol ediliyor…</p>}

      {!loading && data && data.insights.length === 0 && (
        <p className="muted" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '.4rem' }}>
          <CheckCircleIcon /> Dikkat çeken bir durum bulunamadı.
        </p>
      )}

      {!loading && data && data.insights.length > 0 && (
        <>
          {data.summary && (
            <div className="ai-summary">
              <div className="ai-summary-head"><SparkleIcon /> Yapay zeka özeti</div>
              <MarkdownText text={data.summary} />
            </div>
          )}
          {!data.aiEnabled && (
            <p className="hint" style={{ marginTop: 0 }}>
              Yapay zeka deneyimi kapalı — bulgular özetlenmeden listeleniyor.
              <Link to="/ayarlar"> Ayarlar&apos;dan açabilirsiniz.</Link>
            </p>
          )}
          <div className="insight-list">
            {data.insights.map((i) => {
              const to = insightLink(i.code, base);
              return (
                <div key={`${i.code}-${i.title}`} className={`insight ${i.severity}`}>
                  <AlertCircleIcon style={{ flex: '0 0 auto', marginTop: 2 }} />
                  <div className="insight-body">
                    <div className="insight-title">{i.title}</div>
                    <div className="insight-detail">{i.detail}</div>
                  </div>
                  {to && <Link className="btn sm secondary" to={to}>Git</Link>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
