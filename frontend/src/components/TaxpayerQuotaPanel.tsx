import { useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import { Pagination } from './Pagination';
import { AiCreditLedgerEntry, AiCreditReason, AiCreditSummary, Paginated, QuotaLedgerEntry, QuotaReason, QuotaSummary } from '../types';
import { formatDateTime } from '../utils/date';

const QUOTA_REASON_LABELS: Record<QuotaReason, string> = {
  initial: 'Başlangıç', purchase: 'Satın Alma', admin_grant: 'Admin Tahsisi',
  consume: 'Tüketim', refund: 'İade', adjustment: 'Düzeltme',
};
const AI_REASON_LABELS: Record<AiCreditReason, string> = {
  initial: 'Başlangıç', admin_grant: 'Admin Tahsisi', consume: 'Tüketim', refund: 'İade', adjustment: 'Düzeltme',
};

interface Props {
  taxpayerId: string;
}

/**
 * Müşavir — bağlı bir mükellefin kota/AI kredi özeti + geçmişi. Hem `TaxpayerQuotaModal`
 * (Mükelleflerim satırından hızlı bakış) hem `musavir/TaxpayerQuota.tsx` (üst bardaki
 * seçili mükellefe göre tam sayfa) tarafından paylaşılır. Mükellef Hesap sayfasından
 * bu görünürlüğü kapatmışsa backend 403 döner, burada sessizce "paylaşılmamış"
 * mesajına çevrilir (hata gibi gösterilmez — bilinçli bir tercih).
 */
export function TaxpayerQuotaPanel({ taxpayerId }: Props) {
  const [tab, setTab] = useState<'quota' | 'ai'>('quota');

  const [quota, setQuota] = useState<QuotaSummary | null>(null);
  const [quotaLedger, setQuotaLedger] = useState<QuotaLedgerEntry[]>([]);
  const [quotaPage, setQuotaPage] = useState(1);
  const [quotaTotalPages, setQuotaTotalPages] = useState(1);
  const [quotaForbidden, setQuotaForbidden] = useState(false);
  const [quotaLoading, setQuotaLoading] = useState(true);

  const [ai, setAi] = useState<AiCreditSummary | null>(null);
  const [aiLedger, setAiLedger] = useState<AiCreditLedgerEntry[]>([]);
  const [aiPage, setAiPage] = useState(1);
  const [aiTotalPages, setAiTotalPages] = useState(1);
  const [aiForbidden, setAiForbidden] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(false);

  async function loadQuota(p: number) {
    setQuotaLoading(true);
    setQuotaForbidden(false);
    try {
      const [summary, ledger] = await Promise.all([
        apiGet<QuotaSummary>(`/quota/taxpayer/${taxpayerId}`),
        apiGet<Paginated<QuotaLedgerEntry>>(`/quota/taxpayer/${taxpayerId}/ledger`, { limit: 10, page: p }),
      ]);
      setQuota(summary);
      setQuotaLedger(ledger.items);
      setQuotaTotalPages(ledger.totalPages ?? 1);
      setQuotaPage(p);
    } catch {
      setQuotaForbidden(true);
    } finally {
      setQuotaLoading(false);
    }
  }

  async function loadAi(p: number) {
    setAiLoading(true);
    setAiForbidden(false);
    try {
      const [summary, ledger] = await Promise.all([
        apiGet<AiCreditSummary>(`/ai-credits/taxpayer/${taxpayerId}`),
        apiGet<Paginated<AiCreditLedgerEntry>>(`/ai-credits/taxpayer/${taxpayerId}/ledger`, { limit: 10, page: p }),
      ]);
      setAi(summary);
      setAiLedger(ledger.items);
      setAiTotalPages(ledger.totalPages ?? 1);
      setAiPage(p);
    } catch {
      setAiForbidden(true);
    } finally {
      setAiLoading(false);
      setAiLoaded(true);
    }
  }

  useEffect(() => {
    setAiLoaded(false);
    loadQuota(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxpayerId]);
  useEffect(() => { if (tab === 'ai' && !aiLoaded) loadAi(1); }, [tab, aiLoaded]);

  return (
    <>
      <div className="tabs" style={{ marginBottom: '1rem' }}>
        <button type="button" className={`tab ${tab === 'quota' ? 'active' : ''}`} onClick={() => setTab('quota')}>Kota</button>
        <button type="button" className={`tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>AI Kredi</button>
      </div>

      {tab === 'quota' && (
        quotaForbidden ? (
          <p className="muted">Mükellef kota bilgisini paylaşmamış — Hesap sayfasından açabilir.</p>
        ) : (
          <>
            <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
              <div><div className="muted">Limit</div><div className="stat small">{quota?.limit ?? '—'}</div></div>
              <div><div className="muted">Kullanılan</div><div className="stat small">{quota?.used ?? '—'}</div></div>
              <div><div className="muted">Kalan</div><div className="stat small">{quota?.remaining ?? '—'}</div></div>
            </div>
            <div className="table-wrap fixed-h">
              <table className="compact">
                <thead><tr><th>Tarih</th><th>Sebep</th><th>Değişim</th><th>Bakiye</th><th>Not</th></tr></thead>
                <tbody>
                  {quotaLoading && <tr><td colSpan={5} className="muted">Yükleniyor…</td></tr>}
                  {!quotaLoading && quotaLedger.length === 0 && <tr><td colSpan={5} className="muted">Kayıt yok.</td></tr>}
                  {!quotaLoading && quotaLedger.map((l) => (
                    <tr key={l.id}>
                      <td>{formatDateTime(l.createdAt)}</td>
                      <td>{QUOTA_REASON_LABELS[l.reason]}</td>
                      <td className={l.changeAmount >= 0 ? 'quota-positive' : 'quota-negative'}>{l.changeAmount >= 0 ? '+' : ''}{l.changeAmount}</td>
                      <td>{l.balanceAfter}</td>
                      <td>{l.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={quotaPage} totalPages={quotaTotalPages} onChange={loadQuota} disabled={quotaLoading} />
          </>
        )
      )}

      {tab === 'ai' && (
        aiForbidden ? (
          <p className="muted">Mükellef AI kredi bilgisini paylaşmamış — Hesap sayfasından açabilir.</p>
        ) : (
          <>
            <div className="grid cols-3" style={{ marginBottom: '1rem' }}>
              <div><div className="muted">Limit</div><div className="stat small">{ai?.limit ?? '—'}</div></div>
              <div><div className="muted">Kullanılan</div><div className="stat small">{ai?.used ?? '—'}</div></div>
              <div><div className="muted">Kalan</div><div className="stat small">{ai?.remaining ?? '—'}</div></div>
            </div>
            <div className="table-wrap fixed-h">
              <table className="compact">
                <thead><tr><th>Tarih</th><th>Sebep</th><th>Değişim</th><th>Bakiye</th><th>Not</th></tr></thead>
                <tbody>
                  {aiLoading && <tr><td colSpan={5} className="muted">Yükleniyor…</td></tr>}
                  {!aiLoading && aiLedger.length === 0 && <tr><td colSpan={5} className="muted">Kayıt yok.</td></tr>}
                  {!aiLoading && aiLedger.map((l) => (
                    <tr key={l.id}>
                      <td>{formatDateTime(l.createdAt)}</td>
                      <td>{AI_REASON_LABELS[l.reason]}</td>
                      <td className={l.changeAmount >= 0 ? 'quota-positive' : 'quota-negative'}>{l.changeAmount >= 0 ? '+' : ''}{l.changeAmount}</td>
                      <td>{l.balanceAfter}</td>
                      <td>{l.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={aiPage} totalPages={aiTotalPages} onChange={loadAi} disabled={aiLoading} />
          </>
        )
      )}
    </>
  );
}
