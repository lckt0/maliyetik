/**
 * Sanal POS sağlayıcısı soyutlaması.
 *
 * Amaç: sağlayıcı seçimi (iyzico / PayTR / Param / Craftgate…) uygulamanın geri kalanını
 * HİÇ etkilemesin. Ödeme akışının tamamı bu arayüz üzerinden yürür; sağlayıcı geldiğinde
 * yalnızca yeni bir adapter dosyası yazılır ve `PAYMENT_PROVIDER` env değeri değiştirilir.
 *
 * Akış:
 *   1) `createCheckout` → sağlayıcıya yönlendirilecek URL/form döner, `providerRef` kaydedilir.
 *   2) Kullanıcı 3D Secure'u tamamlar; sağlayıcı `returnUrl`'e geri döner.
 *   3) `verifyCallback` → dönüşün gerçekten sağlayıcıdan geldiği ve tutarın doğru olduğu
 *      doğrulanır. TARAYICIDAN GELEN VERİYE ASLA GÜVENİLMEZ.
 *   4) (Varsa) sağlayıcı webhook'u `verifyWebhook` ile doğrulanır — asıl gerçek kaynağı budur;
 *      kullanıcı tarayıcıyı kapatsa bile ödeme sonucu buradan gelir.
 */
export interface CheckoutOrder {
  /** Bizim tarafımızdaki ödeme kaydının id'si — sağlayıcıya sipariş no olarak gider. */
  paymentId: string;
  amount: string;
  currency: string;
  description: string;
  buyer: {
    id: string;
    name: string;
    email: string;
    /** Fatura/KYC için — sağlayıcıya göre zorunlu olabilir. */
    identityNumber?: string;
    phone?: string;
    address?: string;
    city?: string;
    country?: string;
    ip?: string;
  };
  /** Ödeme tamamlanınca kullanıcının döneceği uygulama adresi. */
  returnUrl: string;
}

export interface CheckoutSession {
  /** Kullanıcının yönlendirileceği sağlayıcı sayfası. */
  redirectUrl?: string;
  /** Alternatif: sayfaya gömülecek form/iframe HTML'i (iyzico Checkout Form böyle çalışır). */
  formHtml?: string;
  /**
   * Alternatif: sağlayıcıya POST edilecek imzalı alanlar (Shopier böyle çalışır).
   * HAM HTML yerine bunun tercih edilmesi bilinçli: formu kendi arayüzümüz kurar,
   * sağlayıcıdan gelen işaretlemenin sayfaya girmesi gerekmez.
   */
  formPost?: { url: string; fields: Record<string, string> };
  providerRef: string;
}

export interface PaymentResult {
  paymentId: string;
  providerRef: string;
  success: boolean;
  /** Sağlayıcının doğruladığı tutar — bizdeki tutarla karşılaştırılır. */
  amount?: string;
  currency?: string;
  failureReason?: string;
  raw?: Record<string, unknown>;
}

export interface PaymentProvider {
  /** Sağlayıcı adı — `payments.provider` kolonuna yazılır. */
  readonly name: string;
  /** Gerekli anahtarlar tanımlı mı; değilse ödeme akışı kullanıcıya kapalı gösterilir. */
  isConfigured(): boolean;
  createCheckout(order: CheckoutOrder): Promise<CheckoutSession>;
  verifyCallback(payload: Record<string, unknown>): Promise<PaymentResult>;
  /** İmza doğrulaması için HAM gövde gerekir — JSON'a çevrilmiş hali imzayı bozar. */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): Promise<PaymentResult>;
  refund(providerRef: string, amount: string): Promise<void>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
