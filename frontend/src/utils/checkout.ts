/** Sunucunun ödeme başlatma yanıtı — sağlayıcıya göre alanlardan biri dolu gelir. */
export interface CheckoutSession {
  paymentId: string;
  /** Yönlendirme tabanlı sağlayıcılar (mock, iyzico ödeme sayfası). */
  redirectUrl?: string;
  /** Form POST tabanlı sağlayıcılar (Shopier) — imzalı alanlar. */
  formPost?: { url: string; fields: Record<string, string> };
}

/**
 * Kullanıcıyı ödeme sağlayıcısına gönderir.
 *
 * Shopier yalnızca form POST kabul ediyor; sağlayıcıdan gelen HAM HTML'i sayfaya
 * gömmek yerine alan listesi alınıp form BURADA kuruluyor. Böylece sağlayıcı
 * kaynaklı bir işaretleme hiç DOM'a girmiyor — `innerHTML` ile gömseydik sağlayıcı
 * tarafındaki bir sorun doğrudan bizim sayfamızda çalışan koda dönüşebilirdi.
 *
 * Not: hedef adres CSP'nin `form-action` listesinde olmalı (bkz. nginx-security-headers.conf);
 * aksi hâlde tarayıcı gönderimi HATA VERMEDEN engeller.
 */
export function startCheckout(session: CheckoutSession): void {
  if (session.redirectUrl) {
    window.location.href = session.redirectUrl;
    return;
  }
  if (!session.formPost) {
    throw new Error('Ödeme oturumu başlatılamadı.');
  }

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = session.formPost.url;
  form.style.display = 'none';
  for (const [name, value] of Object.entries(session.formPost.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
