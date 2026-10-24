import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CheckoutOrder, CheckoutSession, PaymentProvider, PaymentResult,
} from './payment-provider';

/**
 * iyzico adapter — İSKELET. Entegrasyon anahtarları geldiğinde doldurulacak.
 *
 * Yapılacaklar (iyzico Checkout Form akışı):
 *  1. `POST /payment/iyzipos/checkoutform/initialize/auth/ecom` ile form token'ı al.
 *     Gövde: locale, conversationId (= paymentId), price, paidPrice, currency,
 *     basketId, paymentGroup, callbackUrl, enabledInstallments, buyer{...},
 *     shippingAddress{...}, billingAddress{...}, basketItems[...].
 *  2. İmza: `Authorization: IYZWSv2 <base64(apiKey:randomKey:signature)>` —
 *     signature = HMAC-SHA256(randomKey + uriPath + body, secretKey).
 *  3. Dönen `checkoutFormContent` sayfaya gömülür (formHtml) ya da `paymentPageUrl`
 *     kullanılır (redirectUrl).
 *  4. callbackUrl'e gelen `token` ile `POST /payment/iyzipos/checkoutform/auth/ecom/detail`
 *     çağrılır; SONUÇ YALNIZCA BU YANITTAN OKUNUR — tarayıcıdan gelen alanlara güvenilmez.
 *  5. `paymentStatus === 'SUCCESS'` ve `paidPrice` bizdeki tutarla birebir eşleşmeli.
 *
 * Not: bağımlılık olarak `iyzipay` paketi eklenebilir, ancak imzalama tek bir HMAC
 * olduğu için düz `fetch` ile de yapılabilir (paket bakımsız kalırsa risk taşımasın).
 */
@Injectable()
export class IyzicoPaymentProvider implements PaymentProvider {
  readonly name = 'iyzico';

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('IYZICO_API_KEY') && this.config.get('IYZICO_SECRET_KEY'));
  }

  private notImplemented(): never {
    throw new ServiceUnavailableException(
      'Ödeme sağlayıcısı henüz etkin değil. Lütfen daha sonra tekrar deneyin.',
    );
  }

  async createCheckout(_order: CheckoutOrder): Promise<CheckoutSession> {
    this.notImplemented();
  }

  async verifyCallback(_payload: Record<string, unknown>): Promise<PaymentResult> {
    this.notImplemented();
  }

  async verifyWebhook(): Promise<PaymentResult> {
    this.notImplemented();
  }

  async refund(): Promise<void> {
    this.notImplemented();
  }
}
