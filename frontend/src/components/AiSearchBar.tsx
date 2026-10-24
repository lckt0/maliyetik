import { useState } from 'react';
import { apiPost } from '../api/client';
import { AiSearchFilter, useAiStatus } from '../ai';
import { SparkleIcon } from './Icons';

interface Props {
  /** Filtre üretildiğinde çağrılır — uygulayan taraf listeyi yeniden çeker. */
  onFilter: (filter: AiSearchFilter) => void;
}

/**
 * Doğal dille evrak arama. Model YALNIZCA sorguyu filtreye çevirir; evrak içeriği
 * modele gitmez ve sonucu her zaman mevcut `/documents` ucu üretir — yetki ve kapsam
 * denetimi değişmez.
 *
 * Yapay zeka deneyimi kapalıysa hiç görünmez; kullanıcı normal filtre çubuğunu kullanır.
 */
export function AiSearchBar({ onFilter }: Props) {
  const status = useAiStatus();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [explanation, setExplanation] = useState('');

  if (!status?.enabled) return null;

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setError('');
    setExplanation('');
    try {
      const res = await apiPost<{ filter: AiSearchFilter; explanation: string }>(
        '/ai-assist/search-filter', { query: query.trim() },
      );
      setExplanation(res.explanation);
      onFilter(res.filter);
    } catch (e2) {
      const message = (e2 as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(message || 'Arama anlaşılamadı, filtreleri elle kullanabilirsiniz.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={run} style={{ marginBottom: '.75rem' }}>
      <div className="ai-search">
        <div className="field">
          <label htmlFor="ai-search-input"><SparkleIcon /> Doğal Dille Ara</label>
          <input id="ai-search-input" value={query} maxLength={300}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ör. geçen ay gelen 5.000 TL üstü alış faturaları" />
        </div>
        <button type="submit" className="btn" disabled={busy || !query.trim()}>
          {busy ? 'Anlıyor…' : 'Ara'}
        </button>
      </div>
      {explanation && <p className="ai-search-explain">{explanation}</p>}
      {error && <div className="alert error" style={{ marginTop: '.5rem', marginBottom: 0 }}>{error}</div>}
    </form>
  );
}
