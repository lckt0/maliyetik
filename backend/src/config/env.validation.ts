import { z } from 'zod';

/**
 * process.env doğrulaması. Uygulama, geçersiz/eksik env ile kalkışta
 * anında fail-fast eder (production güvenliği).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url(),
  CORS_ORIGINS: z.string().default(''),

  // Veritabanı
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number().default(3306),
  DB_DATABASE: z.string(),
  DB_USERNAME: z.string(),
  DB_PASSWORD: z.string(),

  // Redis
  REDIS_HOST: z.string().default('redis'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // SMTP (e-posta doğrulama — Brevo SMTP relay veya herhangi bir sağlayıcı)
  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string(),
  SMTP_PASS: z.string(),
  SMTP_FROM: z.string(),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(1209600),

  // GCS
  GCS_PROJECT_ID: z.string(),
  GCS_BUCKET: z.string(),
  GCS_CREDENTIALS_B64: z.string().optional(),

  // Altyapı Maliyetleri sayfası — canlı veri katmanı (opsiyonel, hiçbiri set edilmezse
  // sayfa yalnızca manuel maliyet defteriyle çalışmaya devam eder).
  GCP_BILLING_CREDENTIALS_B64: z.string().optional(),
  GCP_BILLING_BQ_DATASET: z.string().optional(),
  GCP_BILLING_BQ_TABLE: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),

  // Upload
  MAX_UPLOAD_MB: z.coerce.number().default(50),

  // Gemini (Evrak Dijitalleştir AI) — ucuz model önce denenir, güven düşükse gelişmiş modelle tekrar edilir.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_CHEAP: z.string().default('gemini-flash-latest'),
  /**
   * "Yapay zeka deneyimi" (doğal dille arama, bulgu özeti, yardımcı) için model.
   * Dijitalleştirmeden AYRI tutuluyor çünkü burada düşünme (thinking) kapatılıyor:
   * `gemini-flash-latest` thinkingConfig'i kabul etmiyor ve düşünme token'ları çıktı
   * bütçesini yiyip cevabı kesebiliyor. Sürüm sabitlenmiş
   * model bu parametreyi kabul ediyor, hem daha ucuz hem daha hızlı sonuç veriyor.
   */
  GEMINI_MODEL_LIGHT: z.string().default('gemini-2.5-flash'),
  GEMINI_MODEL_ADVANCED: z.string().default('gemini-pro-latest'),
  GEMINI_CONFIDENCE_THRESHOLD: z.coerce.number().default(0.85),

  // Koltuk sınırı (müşavir paketindeki mükellef sayısı) zorlansın mı (bkz. SeatsService.enforcing).
  ENFORCE_SEAT_LIMITS: z.enum(['true', 'false']).default('false'),

  // Ödeme / Sanal POS — sağlayıcı seçilmezse 'mock' (gerçek tahsilat yok; ödeme akışı
  // kullanıcıya kapalı kalır, bkz. BillingService.paymentsEnabled).
  PAYMENT_PROVIDER: z.enum(['mock', 'iyzico', 'shopier']).default('mock'),
  IYZICO_API_KEY: z.string().optional(),
  IYZICO_SECRET_KEY: z.string().optional(),
  IYZICO_BASE_URL: z.string().optional(),
  // Shopier ara kurum olarak çalışır: banka sanal POS başvurusu gerektirmez, aylık sabit
  // ücreti yoktur; karşılığında komisyonu daha yüksektir (bkz. shopier.provider.ts).
  SHOPIER_API_KEY: z.string().optional(),
  SHOPIER_API_SECRET: z.string().optional(),
  SHOPIER_WEBSITE_INDEX: z.string().optional(),
  // Sağlayıcının geri döneceği adres API'nin DIŞARIDAN görünen kökü olmalı; ayrı bir
  // alan adı kullanılmıyorsa APP_URL yeterlidir.
  API_PUBLIC_URL: z.string().url().optional(),

  // İlk admin (seeder)
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

export type EnvVars = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Geçersiz ortam değişkenleri:\n${issues}`);
  }
  return parsed.data;
}
