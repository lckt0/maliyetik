import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CheckoutOrder, CheckoutSession, PaymentProvider, PaymentResult,
} from './payment-provider';

/**
 * Sanal POS entegrasyonu gelene kadar kullanılan sağlayıcı.
 *
 * Gerçek para hareketi YOKTUR: `createCheckout` uygulamanın kendi "ödeme simülasyonu"
 * sayfasına yönlendirir, oradan onaylanınca callback normal akışın aynısını çalıştırır.
 * Böylece abonelik/kota tahsis zinciri POS olmadan da uçtan uca test edilebilir.
 *
 * ÜRETİMDE AKTİF OLMAMALI: `PAYMENT_PROVIDER=mock` yalnızca geliştirme ortamında
 * anlamlıdır; üretimde gerçek adapter seçilmeden ödeme akışı kullanıcıya kapalı kalır
 * (bkz. BillingService.assertPaymentsEnabled).
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockPaymentProvider.name);

  isConfigured(): boolean {
    return true;
  }

  async createCheckout(order: CheckoutOrder): Promise<CheckoutSession> {
    const providerRef = `mock_${randomUUID()}`;
    this.logger.warn(`[mock] ödeme başlatıldı: payment=${order.paymentId} tutar=${order.amount} ${order.currency}`);
    const url = new URL(order.returnUrl);
    url.searchParams.set('paymentId', order.paymentId);
    url.searchParams.set('providerRef', providerRef);
    url.searchParams.set('mock', '1');
    return { redirectUrl: url.toString(), providerRef };
  }

  async verifyCallback(payload: Record<string, unknown>): Promise<PaymentResult> {
    return {
      paymentId: String(payload.paymentId ?? ''),
      providerRef: String(payload.providerRef ?? ''),
      // Test senaryolarında başarısız ödemeyi de deneyebilmek için.
      success: payload.fail !== '1' && payload.fail !== true,
      failureReason: payload.fail ? 'Test amaçlı başarısız ödeme.' : undefined,
      raw: payload,
    };
  }

  async verifyWebhook(): Promise<PaymentResult> {
    throw new Error('mock sağlayıcı webhook desteklemez.');
  }

  async refund(providerRef: string, amount: string): Promise<void> {
    this.logger.warn(`[mock] iade: ${providerRef} tutar=${amount}`);
  }
}
