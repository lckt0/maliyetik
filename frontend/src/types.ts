export type Role = 'admin' | 'taxpayer' | 'accountant';
export type UserStatus = 'active' | 'suspended' | 'pending';

export interface AuthUser {
  userId: string;
  role: Role;
  email?: string;
  fullName?: string;
  username?: string;
  taxpayerId?: string;
  accountantId?: string;
}

/** Backend `shared/ui-preferences.ts` ile birebir aynı — Ayarlar sayfası bunları düzenler. */
export interface UiPreferences {
  theme?: 'light' | 'dark' | 'system';
  sidebarLeftDocked?: boolean;
  sidebarRightDocked?: boolean;
  uiScale?: number;
  density?: 'comfortable' | 'compact';
  pageSize?: 10 | 20 | 50 | 100;
  reduceMotion?: boolean;
  landingPage?: 'home' | 'documents' | 'upload';
  hideRightSidebar?: boolean;
  emailReminders?: boolean;
  emailDocumentActivity?: boolean;
  /** Yapay zeka deneyimi (doğal dille arama, bulgu özeti, akıllı yardımcı) açık mı. */
  aiExperience?: boolean;
}

export interface OwnProfile {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  username: string | null;
  bio: string | null;
  isPublic: boolean;
  avatarUrl?: string;
  uiPreferences: UiPreferences | null;
  createdAt: string;
  /** Yalnızca taxpayer rolünde dolu. */
  accountantCanViewQuota?: boolean;
  accountantCanViewAiCredits?: boolean;
}

export interface PublicProfile {
  username: string;
  fullName: string;
  role: Role;
  bio: string | null;
  avatarUrl?: string;
}

export interface MetadataField {
  key: string;
  label: string;
  type: 'string' | 'date' | 'decimal' | 'enum' | 'json';
  required: boolean;
  canonical?: boolean;
  options?: string[];
  default?: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminStats {
  users: {
    total: number;
    taxpayers: number;
    accountants: number;
    admins: number;
    active: number;
    suspended: number;
    pending: number;
  };
  documents: { count: number; totalBytes: number };
}

export interface SystemMetrics {
  app: {
    cpuLoadPercent: number;
    memTotalBytes: number;
    memFreeBytes: number;
    processRssBytes: number;
    processHeapUsedBytes: number;
    uptimeSeconds: number;
  };
  mysql: {
    threadsConnected: number;
    maxConnections: number;
    bufferPoolUsedPercent: number;
    dbSizeBytes: number;
    uptimeSeconds: number;
  };
  redis: { usedMemoryBytes: number; connectedClients: number; uptimeSeconds: number } | null;
}

export interface SystemSettings {
  registrationEnabled: boolean;
  taxpayerApprovalRequired: boolean;
  accountantApprovalRequired: boolean;
  maintenanceMode: boolean;
  maintenanceAllowedIps: string[];
  taxpayerAiEnabled: boolean;
  accountantAiEnabled: boolean;
  taxpayerMobileAppEnabled: boolean;
  accountantMobileAppEnabled: boolean;
  adminMobileAppEnabled: boolean;
  updatedAt: string;
}

export interface SystemStatus {
  maintenanceMode: boolean;
  allowedForCaller: boolean;
  registrationEnabled: boolean;
}

export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  companyTitle: string | null;
  displayTitle: string | null;
  vknTckn: string | null;
}

export interface RecognizeResult {
  matched: boolean;
  documentTypeId?: number;
  documentTypeCode?: string;
  title?: string;
  metadata?: Record<string, string>;
}

export interface DocumentType {
  id: number;
  code: string;
  name: string;
  category: 'financial' | 'company' | 'other';
  metadataSchema?: { fields: MetadataField[]; fileAccept?: string; groupField?: string };
  isRequired?: boolean;
  sortOrder: number;
}

export interface CompanyDocumentStatusItem {
  id: number;
  code: string;
  name: string;
  isRequired: boolean;
  uploadedCount: number;
  latestDocumentId: string | null;
  latestTitle: string | null;
  latestUploadedAt: string | null;
}

export interface DocumentRow {
  id: string;
  uuid: string;
  title: string;
  description?: string;
  documentDate?: string;
  documentTypeId: number;
  metadata?: Record<string, unknown>;
  metaAmount?: string;
  metaDocNo?: string;
  metaTaxId?: string;
  metaDirection?: 'alis' | 'satis';
  metaReceiptGroupNo?: string;
  originalName?: string;
  mimeType?: string;
  /** Bayt cinsinden; MySQL BIGINT olduğu için string gelir. */
  fileSize?: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  /** İmzasız, parametresiz uygulama içi dosya ucu — bkz. utils/download.ts (authenticated blob fetch). */
  fileUrl?: string;
  uploadedByName?: string | null;
  updatedByName?: string | null;
  /** false ise Evrak Kayıt (hızlı yükleme) ile eklenmiş, henüz Evrak Dijitalleştir'de tamamlanmamış. */
  isDigitized: boolean;
  digitizedByName?: string | null;
  digitizedAt?: string | null;
}

export type DocumentLogAction = 'uploaded' | 'updated' | 'deleted' | 'restored' | 'purged' | 'digitized';

export interface DocumentLogEntry {
  id: string;
  actorUserId?: string;
  actorName: string;
  action: DocumentLogAction;
  entityType?: string;
  entityId?: string;
  taxpayerId?: string;
  metadata?: { documentTitle?: string; documentTypeId?: number; changedFields?: string[] } | null;
  createdAt: string;
}

export interface GroupSummary {
  count: number;
  totalAmount: number;
  dateFrom: string | null;
  dateTo: string | null;
}

/** Dışa Aktar → Z-Raporu/Luca Excel için mükellef başına hesap kodları — bkz. utils/lucaExport.ts. */
/**
 * Luca dışa aktarımında kullanılan hesap kodu alanları — mükellefi tanımlayan
 * alanlar (`id`, `companyTitle`) hariç. Ayarlar formu bu şekli doğrudan tutar,
 * böylece dışa aktarım fonksiyonlarına tip zorlaması olmadan geçilebilir.
 */
export type LucaAccountCodes = Omit<LucaSettings, 'id' | 'companyTitle'>;

export interface LucaSettings {
  id: string;
  companyTitle: string;
  lucaKasaHesapKodu?: string | null;
  lucaKrediKartiHesapKodu?: string | null;
  lucaYemekKartiHesapKodu?: string | null;
  lucaKdv0ToplamHesapKodu?: string | null;
  lucaKdv10ToplamHesapKodu?: string | null;
  lucaKdv10HesaplananHesapKodu?: string | null;
  lucaKdv20ToplamHesapKodu?: string | null;
  lucaKdv20HesaplananHesapKodu?: string | null;
  lucaBelgeTuru?: string | null;
}

export interface MaliHafizaEntry {
  documentNo: string;
  documentDate: string;
  totalAmount: number;
  taxAmount: number;
  /** Bu satırın rakamları AI tarafından net okunamadı/tahmin edildi — kaydetmeden önce kontrol edin. */
  uncertain: boolean;
}

export interface MaliHafizaStrip {
  label?: string;
  periodStart?: string;
  periodEnd?: string;
  /** Şerit genel olarak yeterince net okunabildi mi. */
  readable: boolean;
  /** Şeritle ilgili tespit edilen sorun varsa kısa açıklama. */
  issue?: string;
  entries: MaliHafizaEntry[];
}

export type MaliHafizaJobStatus = 'analyzing' | 'ready' | 'saving' | 'done' | 'error';

/** `GET /documents/mali-hafiza/jobs/status` — arka planda (sayfadan bağımsız) süren analiz/kayıt işinin durumu. */
export interface MaliHafizaJobState {
  jobId: string;
  status: MaliHafizaJobStatus;
  sourceDocumentId: string;
  fileName: string;
  errorMessage?: string;
  /** Fotoğrafın çözünürlüğü tavsiye edilenin altındaysa kısa uyarı. */
  resolutionWarning?: string;
  strips?: MaliHafizaStrip[];
  commitResult?: MaliHafizaCommitResult;
}

export type MaliHafizaVatRate = '0' | '10' | '20';
export type MaliHafizaPaymentType = 'nakit' | 'kredi_karti' | 'yemek_karti';

export const MALI_HAFIZA_VAT_RATE_LABELS: Record<MaliHafizaVatRate, string> = { '0': '%0', '10': '%10', '20': '%20' };
export const MALI_HAFIZA_PAYMENT_TYPE_LABELS: Record<MaliHafizaPaymentType, string> = {
  nakit: 'Nakit',
  kredi_karti: 'Kredi Kartı',
  yemek_karti: 'Yemek Kartı',
};

export interface MaliHafizaCommitGroupResult {
  groupNo: string;
  count: number;
  totalAmount: number;
}

export interface MaliHafizaCommitResult {
  documentTypeId: number;
  totalDocuments: number;
  groups: MaliHafizaCommitGroupResult[];
}

export const DIRECTION_LABELS: Record<string, string> = { alis: 'Alış', satis: 'Satış' };

export interface VatSummary {
  total: number;
  byType: { documentTypeId: number; typeName: string; count: number; total: number }[];
}

export interface VatNet {
  calculated: number;
  deductible: number;
  net: number;
}

export interface VatPeriodsSummary {
  thisMonth: VatNet;
  lastMonth: VatNet;
  carriedOver: number;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  limit: number;
  /** Yalnızca sayfa (offset) modunda — numaralı sayfalama UI'ı için. */
  total?: number;
  page?: number;
  totalPages?: number;
}

export interface QuotaSummary {
  limit: number;
  used: number;
  /** Kalan hak — negatif olmaz; tavan aşımı `overage` alanında raporlanır. */
  remaining: number;
  /** Tavanın üstünde duran evrak sayısı. */
  overage: number;
  fromPlan: number;
  fromAccountant: number;
  purchased: number;
  /**
   * ARŞİV MODU: hiçbir kaynaktan (kendi planı, müşavir koltuğu, satın alınan paket)
   * hak gelmiyor ama sistemde duran evrak var. Görüntüleme/indirme/dışa aktarma
   * açıktır, yalnızca yeni yükleme durur — evrak SİLİNMEZ.
   */
  archived: boolean;
}

export interface AccountantSummary {
  id: string;
  displayTitle: string;
  city?: string;
  licenseNo?: string;
}

export interface Authorization {
  id: string;
  status: 'pending' | 'active' | 'revoked' | 'rejected';
  taxpayerId: string;
  accountantId: string;
  createdAt: string;
  taxpayer?: { id: string; companyTitle: string; vknTckn: string };
  accountant?: { id: string; displayTitle: string; city?: string };
}

export interface QuotaTaxpayerSearchResult {
  taxpayerProfileId: string;
  companyTitle: string;
  vknTckn: string;
  quotaLimit: number;
  quotaUsed: number;
}

export type QuotaReason = 'initial' | 'purchase' | 'admin_grant' | 'consume' | 'refund' | 'adjustment';

export interface QuotaLedgerEntry {
  id: string;
  changeAmount: number;
  balanceAfter: number;
  reason: QuotaReason;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdAt: string;
}

export interface AiCreditSummary {
  limit: number;
  used: number;
  remaining: number;
}

export interface AiCreditUserSearchResult {
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  aiCreditsLimit: number;
  aiCreditsUsed: number;
}

export type AiCreditReason = 'initial' | 'admin_grant' | 'consume' | 'refund' | 'adjustment';

export interface AiCreditLedgerEntry {
  id: string;
  changeAmount: number;
  balanceAfter: number;
  reason: AiCreditReason;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdAt: string;
}

export interface AiDigitizeResult {
  title: string;
  metadata: Record<string, string>;
  confidence: number;
  modelUsed: 'cheap' | 'advanced';
  uncertainFields: string[];
}

export type AutoDigitizeStatusValue =
  | 'idle'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'stopped_credits'
  | 'failed'
  | 'interrupted';

export interface AutoDigitizeStatus {
  status: AutoDigitizeStatusValue;
  jobId?: string;
  total?: number;
  processed?: number;
  success?: number;
  failed?: number;
  currentDocTitle?: string;
  startedAt?: string;
  finishedAt?: string;
}

/** Abonelik planı — /plans (herkese açık) ve /billing/plans uçlarından gelir. */
export interface SubscriptionPlan {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  audience: 'taxpayer' | 'accountant';
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  includedQuota: string;
  /** Müşavir planlarında koltuk (mükellef) başına evrak tavanı; mükellef planlarında "0". */
  quotaPerSeat: string;
  includedAiCredits: string;
  /** 0 = sınırsız. */
  maxTaxpayers: number;
  trialDays: number;
  features?: string[] | null;
  isActive: number;
  isPublic: number;
  sortOrder: number;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export type BillingPeriod = 'monthly' | 'yearly';

export interface Subscription {
  id: string;
  planId: number;
  plan?: SubscriptionPlan;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: number;
  note?: string | null;
}

export interface Entitlements {
  planCode: string | null;
  planName: string | null;
  status: SubscriptionStatus | null;
  periodEnd: string | null;
  maxTaxpayers: number;
  includedQuota: number;
  includedAiCredits: number;
  /** Müşavir planlarında bir koltuğun (mükellefin) evrak tavanı; mükellef planlarında 0. */
  quotaPerSeat: number;
  /** Yalnızca müşavirde dolu. `seatsAvailable === null` → sınırsız ya da plan yok. */
  seatsUsed?: number;
  seatsAvailable?: number | null;
  active: boolean;
}

export interface BillingSummary {
  entitlements: Entitlements;
  subscription: Subscription | null;
  /** Sanal POS henüz bağlı değilse false — arayüz "iletişime geçin" gösterir. */
  paymentsEnabled: boolean;
}

export type PaymentKind = 'subscription' | 'quota_package' | 'ai_credits';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';

export interface PaymentRow {
  id: string;
  kind: PaymentKind;
  amount: string;
  currency: string;
  description?: string | null;
  status: PaymentStatus;
  failureReason?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

/** Müşavir anasayfasındaki Mükellef Panosu satırı — GET /accountants/overview. */
export interface TaxpayerOverviewRow {
  taxpayerId: string;
  companyTitle: string;
  vknTckn: string;
  documentsThisMonth: number;
  pendingDigitize: number;
  missingCompanyDocs: number;
  lastUploadAt: string | null;
  quotaLimit: number;
  quotaUsed: number;
  /** Mükellef kota paylaşımını kapattıysa false — sayılar gizlenir. */
  quotaVisible: boolean;
}

export interface QuotaPackage {
  id: number;
  code: string;
  name: string;
  quotaAmount: string;
  price: string;
  currency: string;
  sortOrder: number;
}

/** Genel denetim günlüğü (admin) — evrak-dışı işlemleri de kapsar. `DocumentLogEntry` ile aynı şekil, aksiyon kümesi geniş. */
export interface AuditLogEntry {
  id: string;
  actorUserId?: string;
  actorName: string;
  action: string;
  entityType?: string;
  entityId?: string;
  taxpayerId?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export type InfraCostCategory = 'server' | 'hosting' | 'database' | 'storage' | 'domain' | 'email' | 'other';
export type InfraCostBillingCycle = 'monthly' | 'yearly' | 'one_time';

export interface InfraCostRow {
  id: string;
  name: string;
  category: InfraCostCategory;
  provider?: string;
  amount: string;
  currency: string;
  billingCycle: InfraCostBillingCycle;
  nextBillingDate?: string;
  note?: string;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

export interface InfraCostSummary {
  totalMonthlyEquivalent: number;
  byCategory: { category: InfraCostCategory; monthlyEquivalent: number }[];
}

export interface GcpBillingSummary {
  configured: boolean;
  last30DaysByService?: { service: string; cost: number; currency: string }[];
  last30DaysTotal?: number;
  currency?: string;
}

export interface BrevoAccountSummary {
  configured: boolean;
  planType?: string;
  credits?: number;
  companyName?: string;
}

export interface InfraLiveData {
  gcpBilling: GcpBillingSummary;
  brevo: BrevoAccountSummary;
  gcs: { storageBytes: number };
}
