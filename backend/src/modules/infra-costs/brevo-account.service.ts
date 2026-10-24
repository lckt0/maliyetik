import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration } from '../../config/configuration';

export interface BrevoAccountSummary {
  configured: boolean;
  planType?: string;
  credits?: number;
  companyName?: string;
}

/**
 * Brevo (e-posta doğrulama SMTP relay'i) hesap/plan bilgisi. Brevo API'si fatura
 * tutarını değil plan/kredi kullanımını döndürür — gerçek ödenen tutar admin
 * tarafından manuel maliyet defterine girilir, bu yalnızca canlı kullanım göstergesidir.
 */
@Injectable()
export class BrevoAccountService {
  private readonly logger = new Logger(BrevoAccountService.name);

  constructor(private readonly config: ConfigService<Configuration, true>) {}

  async getSummary(): Promise<BrevoAccountSummary> {
    const apiKey = this.config.get('brevo', { infer: true }).apiKey;
    if (!apiKey) return { configured: false };

    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': apiKey, accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Brevo API ${res.status}`);
      const data = (await res.json()) as {
        companyName?: string;
        plan?: { type?: string; credits?: number }[];
      };
      const plan = data.plan?.[0];
      return {
        configured: true,
        planType: plan?.type,
        credits: plan?.credits,
        companyName: data.companyName,
      };
    } catch (err) {
      this.logger.warn(`Brevo hesap bilgisi alınamadı: ${(err as Error).message}`);
      return { configured: true };
    }
  }
}
