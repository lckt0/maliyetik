import { useEffect, useRef, useState } from 'react';
import { apiPost } from '../api/client';
import { useAiStatus } from '../ai';
import { SparkleIcon, XIcon } from './Icons';
import { MarkdownText } from './MarkdownText';

interface Turn { role: 'user' | 'assistant'; text: string }

const STORAGE_KEY = 'maliyetik:assistant-open';

/** Kullanıcı ne soracağını bilemesin diye birkaç başlangıç sorusu. */
const SUGGESTIONS = [
  'Evrak kotam nasıl hesaplanıyor?',
  'Bir evrağın alanlarını nasıl tamamlarım?',
  'Z-Raporlarını Luca\'ya nasıl aktarırım?',
  'Müşavirime nasıl yetki veririm?',
];

/**
 * Panel içi akıllı yardımcı — "bunu nasıl yaparım" sorularına ürünün kendi kurallarına
 * göre cevap verir.
 *
 * Yardımcıya evrak içeriği GÖNDERİLMEZ; yalnızca kullanıcının sorusu ve rolü gider.
 * Yapay zeka deneyimi kapalıysa düğme hiç görünmez (bkz. ai.tsx `useAiStatus`).
 */
export function AiAssistant() {
  const status = useAiStatus();
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, open ? '1' : '0'); } catch { /* özel mod */ }
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  if (!status?.enabled) return null;

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setTurns((t) => [...t, { role: 'user', text: trimmed }]);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const res = await apiPost<{ answer: string }>('/ai-assist/ask', { question: trimmed });
      setTurns((t) => [...t, { role: 'assistant', text: res.answer }]);
    } catch (e) {
      const message = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(message || 'Yardımcı şu an cevap veremedi.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="ai-fab" onClick={() => setOpen(true)} title="Akıllı yardımcı">
        <SparkleIcon /> <span>Yardımcı</span>
      </button>
    );
  }

  return (
    <aside className="ai-panel" aria-label="Akıllı yardımcı">
      <header className="ai-panel-head">
        <SparkleIcon />
        <b>Akıllı Yardımcı</b>
        <span className="muted">{status.remaining.ask} soru kaldı</span>
        <button type="button" className="icon-btn sm" onClick={() => setOpen(false)} aria-label="Kapat">
          <XIcon />
        </button>
      </header>

      <div className="ai-panel-body thin-scroll" ref={bodyRef}>
        {turns.length === 0 && (
          <>
            <p className="ai-intro">
              Maliyetik&apos;i nasıl kullanacağınızı sorun. Evraklarınızın içeriğini görmez —
              yalnızca sistemin nasıl çalıştığını anlatır.
            </p>
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="ai-suggestion" onClick={() => void ask(s)}>{s}</button>
              ))}
            </div>
          </>
        )}
        {turns.map((t, i) => (
          <div key={`${t.role}-${i}`} className={`ai-turn ${t.role}`}>
            {t.role === 'assistant' ? <MarkdownText text={t.text} /> : t.text}
          </div>
        ))}
        {busy && <div className="ai-turn assistant muted">Yazıyor…</div>}
        {error && <div className="alert error" style={{ margin: '.5rem 0 0' }}>{error}</div>}
      </div>

      <form className="ai-panel-form" onSubmit={(e) => { e.preventDefault(); void ask(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={600}
          placeholder="Sorunuzu yazın…" aria-label="Soru" />
        <button type="submit" className="btn sm" disabled={busy || !input.trim()}>Sor</button>
      </form>
    </aside>
  );
}
