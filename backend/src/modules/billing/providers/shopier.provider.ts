import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt } from 'node:crypto';
import {
  CheckoutOrder, CheckoutSession, PaymentProvider, PaymentResult,
} from './payment-provider';

/**
 * Shopier ödeme adapteri (api_pay4 form akışı).
 *
 * NEDEN SHOPIER: banka sanal POS'u için şirket geçmişi, ciro taahhüdü ve haftalar süren
 * onay gerekir. Shopier ara kurum olarak çalışır; başvuru gün içinde sonuçlanır, aylık
 * sabit ücret yoktur. Karşılığında komisyon daha yüksektir (%2,99 + ₺0,49, KDV hariç —
 * efektif ~%3,6) ve para doğrudan bizim hesabımıza değil, Shopier hesabına geçip hakediş
 * takviminde aktarılır. Ciro büyüdüğünde banka POS'una geçiş için tek yapılacak iş yeni
 * bir adapter yazıp PAYMENT_PROVIDER değerini değiştirmektir.
 *
 * AKIŞ (tek yönlü form POST):
 *   1) createCheckout → imzalı alan listesi döner; tarayıcı bu alanları Shopier'e POST eder.
 *   2) Kullanıcı kartla öder, Shopier `callback` adresimize POST atar.
 *   3) verifyCallback → imza HMAC ile doğrulanır.
 *
 * ÖNEMLİ GÜVENLİK NOTU: Shopier'in dönüş imzası YALNIZCA `random_nr + platform_order_id`
 * üzerinden hesaplanır — TUTAR İMZAYA DAHİL DEĞİLDİR. Bu yüzden dönüşteki hiçbir tutar
 * alanına güvenilemez; ödenmesi gereken tutar bizim kendi `payments` kaydımızdan okunur
 * (bkz. BillingService.finalizePayment). Adapter bilerek `amount` döndürmez: döndürseydi
 * doğrulanmamış bir sayıyı doğrulanmış gibi göstermiş olurduk.
 *
 * BİLİNEN SINIR: bu akışta sunucudan sunucuya ayrı bir webhook yoktur. Kart çekildikten
 * sonra dönüş isteği kaybolursa ödeme bizde `pending` kalır; kullanıcı parayı öder ama
 * hakkı açılmaz. Karşılığı: Shopier panelindeki işlem listesiyle karşılaştırıp admin
 * ekranından aboneliği elle tanımlamak. Bu yüzden `pending` ödemeler loglanır.
 */
@Injectable()
export class ShopierPaymentProvider implements PaymentProvider {
  readonly name = 'shopier';
  private readonly logger = new Logger(ShopierPaymentProvider.name);

  private static readonly ENDPOINT = 'https://www.shopier.com/ShowProduct/api_pay4.php';
  /** Shopier para birimi kodları: 0 = TRY, 1 = USD, 2 = EUR. */
  private static readonly CURRENCY: Record<string, string> = { TRY: '0', USD: '1', EUR: '2' };

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('SHOPIER_API_KEY') && this.config.get('SHOPIER_API_SECRET'));
  }

  private secret(): string {
    const secret = this.config.get<string>('SHOPIER_API_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('Ödeme sağlayıcısı yapılandırılmamış.');
    }
    return secret;
  }

  private sign(data: string): string {
    return createHmac('sha256', this.secret()).update(data, 'utf8').digest('base64');
  }

  /**
   * Shopier `buyer_id_nr` alanına sayısal bir değer bekler; bizim kullanıcı kimliğimiz
   * UUID. Kimliği sızdırmadan, aynı kullanıcı için hep aynı sayıyı üretmek üzere
   * anahtarla HMAC alınıp ilk 9 hane sayıya çevrilir (çakışma ihtimali önemsiz —
   * bu alan yalnızca Shopier tarafında alıcı eşleştirmesi için kullanılır).
   */
  private numericBuyerId(userId: string): string {
    const digest = createHmac('sha256', this.secret()).update(`buyer:${userId}`).digest('hex');
    return String(BigInt(`0x${digest.slice(0, 12)}`) % 1_000_000_000n);
  }

  private splitName(fullName: string): { name: string; surname: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return { name: parts[0] ?? 'Musteri', surname: '-' };
    return { name: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1] };
  }

  async createCheckout(order: CheckoutOrder): Promise<CheckoutSession> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Ödeme sağlayıcısı yapılandırılmamış.');
    }
    const currency = ShopierPaymentProvider.CURRENCY[order.currency.toUpperCase()];
    if (!currency) {
      throw new ServiceUnavailableException(`Shopier bu para birimini desteklemiyor: ${order.currency}`);
    }

    // İmza, GÖNDERİLEN metnin birebir aynısı üzerinden hesaplanmalı; bu yüzden tutar
    // bir kez biçimlendirilip hem alanlarda hem imzada aynı string kullanılır.
    const total = Number(order.amount).toFixed(2);
    const randomNr = String(randomInt(100000, 999999));
    const { name, surname } = this.splitName(order.buyer.name);

    const fields: Record<string, string> = {
      API_key: this.config.get<string>('SHOPIER_API_KEY') ?? '',
      website_index: this.config.get<string>('SHOPIER_WEBSITE_INDEX') ?? '1',
      platform_order_id: order.paymentId,
      product_name: order.description.slice(0, 100),
      // 1 = dijital ürün: Shopier kargo/teslimat alanlarını zorunlu tutmaz.
      product_type: '1',
      buyer_name: name,
      buyer_surname: surname,
      buyer_email: order.buyer.email,
      buyer_account_age: '0',
      buyer_id_nr: this.numericBuyerId(order.buyer.id),
      buyer_phone: order.buyer.phone ?? '',
      billing_address: order.buyer.address ?? '-',
      billing_city: order.buyer.city ?? '-',
      billing_country: order.buyer.country ?? 'Turkiye',
      billing_postcode: '-',
      // Dijital ürün; teslimat adresi fatura adresiyle aynı gönderilir (alanlar zorunlu).
      shipping_address: order.buyer.address ?? '-',
      shipping_city: order.buyer.city ?? '-',
      shipping_country: order.buyer.country ?? 'Turkiye',
      shipping_postcode: '-',
      total_order_value: total,
      currency,
      platform: '0',
      is_in_frame: '0',
      current_language: '0',
      modul_version: '1.0.0',
      random_nr: randomNr,
      callback: `${this.config.get('API_PUBLIC_URL') ?? this.config.get('APP_URL')}/api/v1/payments/callback`,
    };
    fields.signature = this.sign(randomNr + order.paymentId + total + currency);

    return {
      // Shopier yalnızca form POST kabul eder; sağlayıcıdan gelen HAM HTML'i sayfaya
      // gömmek yerine alanlar döndürülür ve formu kendi arayüzümüz kurar. Böylece
      // sağlayıcı kaynaklı bir HTML enjeksiyonu yüzeyi hiç oluşmaz.
      formPost: { url: ShopierPaymentProvider.ENDPOINT, fields },
      // Dönüşteki imzayı bu değerle karşılaştırabilmek için saklanır.
      providerRef: `shopier_${randomNr}`,
    };
  }

  async verifyCallback(payload: Record<string, unknown>): Promise<PaymentResult> {
    const str = (key: string): string => {
      const value = payload[key];
      return value == null ? '' : String(value);
    };
    const orderId = str('platform_order_id');
    const randomNr = str('random_nr');
    const signature = str('signature');

    const expected = this.sign(randomNr + orderId);
    // Sabit süreli karşılaştırma gerekmiyor: imza gizli değil, gizli olan anahtar.
    // Yine de uzunluk farkında erken çıkılır ki farklı kodlamalar sessizce eşleşmesin.
    if (!signature || signature.length !== expected.length || signature !== expected) {
      this.logger.warn(`Shopier dönüşü imza doğrulamasında elendi: order=${orderId}`);
      throw new ServiceUnavailableException('Ödeme doğrulanamadı.');
    }

    const success = str('status').toLowerCase() === 'success';
    return {
      paymentId: orderId,
      providerRef: str('payment_id') || `shopier_${randomNr}`,
      success,
      // Tutar bilerek doldurulmaz — Shopier imzası tutarı kapsamaz (bkz. sınıf başı not).
      failureReason: success ? undefined : 'Ödeme sağlayıcı tarafından onaylanmadı.',
      raw: payload,
    };
  }

  async verifyWebhook(): Promise<PaymentResult> {
    // api_pay4 akışında ayrı bir sunucu-sunucu bildirimi yok; tek kaynak callback.
    throw new ServiceUnavailableException('Shopier bu akışta webhook göndermez.');
  }

  async refund(providerRef: string, amount: string): Promise<void> {
    // Shopier iadeleri yalnızca satıcı panelinden yapılır; API'si yoktur. Sessizce
    // "iade edildi" dönmemek için açıkça hata veriyoruz.
    this.logger.error(`Shopier iadesi API ile yapılamaz — panelden işleyin: ${providerRef} tutar=${amount}`);
    throw new ServiceUnavailableException(
      'Shopier iadeleri satıcı panelinden yapılır. Lütfen destek ekibiyle iletişime geçin.',
    );
  }
}
