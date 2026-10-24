import { EnvVars } from './env.validation';

/**
 * Tipli, gruplandırılmış konfigürasyon. ConfigService<Configuration, true>
 * ile `config.get('database.host', { infer: true })` şeklinde okunur.
 */
export const configuration = (env: EnvVars) => ({
  env: env.NODE_ENV,
  port: env.PORT,
  appUrl: env.APP_URL,
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  maxUploadMb: env.MAX_UPLOAD_MB,

  database: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_DATABASE,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
  },

  redis: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },

  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  },

  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  },

  gcs: {
    projectId: env.GCS_PROJECT_ID,
    bucket: env.GCS_BUCKET,
    credentialsB64: env.GCS_CREDENTIALS_B64,
  },

  gcpBilling: {
    credentialsB64: env.GCP_BILLING_CREDENTIALS_B64,
    bqDataset: env.GCP_BILLING_BQ_DATASET,
    bqTable: env.GCP_BILLING_BQ_TABLE,
  },

  brevo: {
    apiKey: env.BREVO_API_KEY,
  },

  gemini: {
    apiKey: env.GEMINI_API_KEY,
    modelCheap: env.GEMINI_MODEL_CHEAP,
    modelLight: env.GEMINI_MODEL_LIGHT,
    modelAdvanced: env.GEMINI_MODEL_ADVANCED,
    confidenceThreshold: env.GEMINI_CONFIDENCE_THRESHOLD,
  },

  admin: {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
  },
});

export type Configuration = ReturnType<typeof configuration>;
