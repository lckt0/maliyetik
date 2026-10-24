import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BigQuery } from '@google-cloud/bigquery';
import { Configuration } from '../../config/configuration';

export interface GcpBillingSummary {
  configured: boolean;
  /** Son 30 günün servis bazlı toplam harcaması (BigQuery billing export tablosundan). */
  last30DaysByService?: { service: string; cost: number; currency: string }[];
  last30DaysTotal?: number;
  currency?: string;
}

/**
 * GCP gerçek harcaması, resmi olarak yalnızca BigQuery billing export tablosu
 * üzerinden programatik okunabilir (GCP Konsolu > Faturalandırma > Faturalandırma
 * dışa aktarımları ile kurulur). Bu env'ler set edilmemişse özellik sessizce
 * devre dışı kalır — sayfa manuel maliyet defterine geri düşer.
 */
@Injectable()
export class GcpBillingService {
  private readonly logger = new Logger(GcpBillingService.name);

  constructor(private readonly config: ConfigService<Configuration, true>) {}

  private isConfigured(): boolean {
    const cfg = this.config.get('gcpBilling', { infer: true });
    return !!(cfg.credentialsB64 && cfg.bqDataset && cfg.bqTable);
  }

  async getSummary(): Promise<GcpBillingSummary> {
    if (!this.isConfigured()) return { configured: false };

    const cfg = this.config.get('gcpBilling', { infer: true });
    try {
      const credentials = JSON.parse(Buffer.from(cfg.credentialsB64!, 'base64').toString('utf8'));
      const bigquery = new BigQuery({ projectId: credentials.project_id, credentials });

      const query = `
        SELECT service.description AS service, SUM(cost) AS cost, ANY_VALUE(currency) AS currency
        FROM \`${cfg.bqDataset}.${cfg.bqTable}\`
        WHERE usage_start_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
        GROUP BY service
        ORDER BY cost DESC
      `;
      const [rows] = await bigquery.query({ query });
      const byService = rows.map((r: { service: string; cost: number; currency: string }) => ({
        service: r.service, cost: Number(r.cost), currency: r.currency,
      }));
      return {
        configured: true,
        last30DaysByService: byService,
        last30DaysTotal: byService.reduce((sum, r) => sum + r.cost, 0),
        currency: byService[0]?.currency ?? 'USD',
      };
    } catch (err) {
      this.logger.warn(`GCP Billing sorgusu başarısız: ${(err as Error).message}`);
      return { configured: true, last30DaysByService: [], last30DaysTotal: 0 };
    }
  }
}
