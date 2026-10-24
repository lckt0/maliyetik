export enum Role {
  ADMIN = 'admin',
  TAXPAYER = 'taxpayer',
  ACCOUNTANT = 'accountant',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export enum DocumentCategory {
  FINANCIAL = 'financial',
  COMPANY = 'company',
  OTHER = 'other',
}

export enum DocumentStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

export enum AuthorizationStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  REVOKED = 'revoked',
  REJECTED = 'rejected',
}

export enum QuotaReason {
  INITIAL = 'initial',
  PURCHASE = 'purchase',
  ADMIN_GRANT = 'admin_grant',
  CONSUME = 'consume',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
}

/** Evrak Dijitalleştir (AI) kredi hareket nedenleri — QuotaReason ile aynı şekil, satın alma yok. */
export enum AiCreditReason {
  INITIAL = 'initial',
  ADMIN_GRANT = 'admin_grant',
  CONSUME = 'consume',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
}

/** documents tablosunda generated meta_* kolonlarına çıkan kanonik JSON anahtarları */
export const CANONICAL_META_KEYS = [
  'documentNo',
  'totalAmount',
  'taxAmount',
  'vknTckn',
  'counterpartyTitle',
  'currency',
  'direction',
  'receiptGroupNo',
] as const;

export enum InvoiceDirection {
  ALIS = 'alis',
  SATIS = 'satis',
}

/**
 * Evrağın hangi yoldan girdiği. Şimdiye kadar hepsi tek bir uca (`POST /documents`)
 * düştüğü için "mobil mi kullanıldı, toplu ZIP mi işe yaradı" sorusu veritabanından
 * cevaplanamıyordu — en çok emek verilen akışların kullanılıp kullanılmadığını ancak
 * bu ayrım gösterir. Geriye dönük üretilemez, bu yüzden ölçüm ileriye doğru başlar:
 * kolon eklenmeden önceki kayıtlar `unknown` kalır.
 */
export enum DocumentSource {
  /** Detaylı Yükleme formu (alan doğrulamalı). */
  WEB_FORM = 'web_form',
  /** Evrak Kayıt — yalnızca tür + dosya, dijitalleştirme kuyruğuna düşer. */
  WEB_QUICK = 'web_quick',
  /** Mobil PWA yükleme ekranı. */
  MOBILE = 'mobile',
  /** Mobil kamera tarayıcısı. */
  MOBILE_SCAN = 'mobile_scan',
  /** Toplu ZIP yükleme. */
  BULK_ZIP = 'bulk_zip',
  /** Luca arşivinden içe aktarım. */
  LUCA_IMPORT = 'luca_import',
  /** Çoklu fatura PDF'inin bölünmesiyle oluşan evraklar. */
  PDF_SPLIT = 'pdf_split',
  /** Mali Hafıza raporundan üretilen Z-Raporu satırları. */
  MALI_HAFIZA = 'mali_hafiza',
  /** Kolon eklenmeden önce yüklenenler ve kaynağını bildirmeyen istemciler. */
  UNKNOWN = 'unknown',
}

export enum DocumentAuditAction {
  UPLOADED = 'uploaded',
  UPDATED = 'updated',
  DELETED = 'deleted',
  RESTORED = 'restored',
  PURGED = 'purged',
  DIGITIZED = 'digitized',
}

/**
 * Oturum açma izi. Evrak ve admin işlemleri kaydediliyordu ama GİRİŞ kaydedilmiyordu;
 * bu yüzden "bu hesap kaç farklı günde kullandı" sorusu cevaplanamıyordu — pilot
 * değerlendirmesinin en temel sorusu bu ve geriye dönük üretilemiyor.
 */
export enum AccessAuditAction {
  LOGIN = 'auth.login',
}

/** Denetim günlüğünde görünen, evrak-dışı admin işlemleri için aksiyon adları. */
export enum AdminAuditAction {
  USER_ROLE_CHANGED = 'admin.user_role_changed',
  USER_STATUS_CHANGED = 'admin.user_status_changed',
  USER_APPROVED = 'admin.user_approved',
  USER_REJECTED = 'admin.user_rejected',
  USER_REMOVED = 'admin.user_removed',
  USER_IMPERSONATED = 'admin.user_impersonated',
  USER_PASSWORD_CHANGED = 'admin.user_password_changed',
  USER_PASSWORD_RESET_LINK_CREATED = 'admin.user_password_reset_link_created',
  ANNOUNCEMENT_CREATED = 'admin.announcement_created',
  ANNOUNCEMENT_UPDATED = 'admin.announcement_updated',
  ANNOUNCEMENT_DELETED = 'admin.announcement_deleted',
  QUOTA_GRANTED = 'admin.quota_granted',
  AI_CREDITS_GRANTED = 'admin.ai_credits_granted',
  SETTINGS_UPDATED = 'admin.settings_updated',
  INFRA_COST_CREATED = 'admin.infra_cost_created',
  INFRA_COST_UPDATED = 'admin.infra_cost_updated',
  INFRA_COST_DELETED = 'admin.infra_cost_deleted',
  PAYMENT_RECONCILED = 'admin.payment_reconciled',
  PAYMENT_MARKED_FAILED = 'admin.payment_marked_failed',
}

export enum InfraCostCategory {
  SERVER = 'server',
  HOSTING = 'hosting',
  DATABASE = 'database',
  STORAGE = 'storage',
  DOMAIN = 'domain',
  EMAIL = 'email',
  OTHER = 'other',
}

export enum InfraCostBillingCycle {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  ONE_TIME = 'one_time',
}
