import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api/client';
import { useAuth } from './auth';

export interface AiStatus {
  enabled: boolean;
  remaining: { search: number; ask: number };
}

export interface AiSearchFilter {
  documentTypeCode?: string;
  dateFrom?: string;
  dateTo?: string;
  direction?: 'alis' | 'satis';
  amountMin?: number;
  amountMax?: number;
  q?: string;
}

export interface AiInsight {
  code: 'missing_period' | 'document_no_gap' | 'undigitized_backlog' | 'unusual_amount' | 'repeated_amount' | 'quiet_taxpayer';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  documentIds?: string[];
}

export interface AiInsightsResult {
  insights: AiInsight[];
  summary: string | null;
  aiEnabled: boolean;
  generatedAt: string;
}

/**
 * Yapay zeka deneyiminin açık olup olmadığı — arayüz AI öğelerini göstermeden önce sorar.
 *
 * Üç kapı birden kontrol edilir (sunucuda): sistem yapılandırması, admin rol anahtarı ve
 * kullanıcının kendi tercihi. Kapalıysa AI'a ait hiçbir düğme/kutu gösterilmez; yerine
 * özelliğin AI'sız hâli çalışır (ör. bulgular ham liste olarak görünür).
 */
export function useAiStatus(): AiStatus | null {
  const { user } = useAuth();
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    if (!user) { setStatus(null); return; }
    apiGet<AiStatus>('/ai-assist/status')
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, remaining: { search: 0, ask: 0 } }));
  }, [user?.userId]);

  return status;
}

/** Bulgu koduna göre kullanıcıyı doğru sayfaya götüren yol — arayüzde "Git" bağlantısı. */
export function insightLink(code: AiInsight['code'], base: string): string | null {
  switch (code) {
    case 'undigitized_backlog': return `${base}/dijitallestir`;
    case 'repeated_amount': return `${base}/cift-evrak`;
    case 'missing_period':
    case 'document_no_gap':
    case 'unusual_amount': return `${base}/evraklar`;
    default: return null;
  }
}

/** Arayüzde birden çok yerde kullanılan "yapay zeka çalışıyor" durumu için ortak kanca. */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): { run: (...args: TArgs) => Promise<TResult | null>; busy: boolean; error: string } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (...args: TArgs) => {
    setBusy(true);
    setError('');
    try {
      return await fn(...args);
    } catch (e) {
      const message = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message;
      setError(message || 'İşlem tamamlanamadı.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [fn]);

  return { run, busy, error };
}
