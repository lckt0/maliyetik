import { Body, Controller, Headers, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { BillingService } from './billing.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider';

/**
 * Sağlayıcı dönüşleri — kimlik doğrulaması YOKTUR (sağlayıcı bizim oturumumuzu taşımaz).
 * Güvenlik tamamen sağlayıcı doğrulamasına dayanır: gelen alanlara güvenilmez, sonuç
 * `provider.verifyCallback` / `verifyWebhook` içinde imza doğrulanarak belirlenir
 * (bkz. providers/payment-provider.ts).
 */
@Controller('payments')
export class PaymentsCallbackController {
  constructor(
    private readonly billing: BillingService,
    private readonly config: ConfigService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Ödeme dönüşü. Sağlayıcıya göre iki farklı istemci gelir:
   *  - Shopier bu adrese doğrudan KULLANICININ TARAYICISINI form POST'u ile yollar;
   *    kullanıcı JSON görmesin diye sonuç sayfasına 303 ile yönlendirilir.
   *  - Kendi arayüzümüz (mock/iyzico dönüşünde) `?json=1` ile çağırır ve yanıtı okur.
   *
   * 303 seçimi bilinçli: POST → GET dönüşümünü garanti eder, 302'de bazı istemciler
   * yeniden POST atıp ödemeyi iki kez işlemeye çalışır (finalizePayment idempotent
   * olsa da gereksiz gürültü üretir).
   */
  @Post('callback')
  async callback(
    @Body() body: Record<string, unknown>,
    @Query('json') json: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.provider.verifyCallback(body);
    const payment = await this.billing.finalizePayment(result);
    const payload = {
      status: payment.status,
      paymentId: payment.id,
      failureReason: payment.failureReason ?? null,
    };
    if (json === '1') {
      res.json(payload);
      return;
    }
    const url = new URL(`${this.config.get('APP_URL')}/odeme/sonuc`);
    url.searchParams.set('paymentId', payment.id);
    url.searchParams.set('durum', payment.status);
    res.redirect(303, url.toString());
  }

  /**
   * Sağlayıcı sunucudan sunucuya bildirimi. Destekleyen sağlayıcılarda asıl gerçek
   * kaynağı budur: kullanıcı tarayıcıyı kapatsa bile sonuç buradan gelir. Shopier'in
   * api_pay4 akışında böyle bir bildirim YOKTUR — orada tek kaynak callback'tir.
   *
   * NOT: imza doğrulaması HAM gövde gerektirir. Böyle bir sağlayıcıya geçilirse main.ts'te
   * bu yol için `express.raw()` etkinleştirilmeli (`rawBody` alanı dolsun); aksi halde
   * gövde JSON'a çevrilirken imza bozulur.
   */
  @Post('webhook')
  async webhook(@Headers() headers: Record<string, string>, @Req() req: Request & { rawBody?: Buffer }) {
    const result = await this.provider.verifyWebhook(headers, req.rawBody ?? Buffer.from(''));
    const payment = await this.billing.finalizePayment(result);
    return { status: payment.status };
  }
}
