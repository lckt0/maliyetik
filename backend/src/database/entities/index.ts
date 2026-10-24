import { User } from './user.entity';
import { TaxpayerProfile } from './taxpayer-profile.entity';
import { AccountantProfile } from './accountant-profile.entity';
import { AccountantAuthorization } from './accountant-authorization.entity';
import { DocumentType } from './document-type.entity';
import { Document } from './document.entity';
import { QuotaLedger } from './quota-ledger.entity';
import { QuotaPackage } from './quota-package.entity';
import { AiCreditLedger } from './ai-credit-ledger.entity';
import { Payment } from './payment.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { Subscription } from './subscription.entity';
import { RefreshToken } from './refresh-token.entity';
import { AuditLog } from './audit-log.entity';
import { Note } from './note.entity';
import { Notification } from './notification.entity';
import { Announcement } from './announcement.entity';
import { SystemSetting } from './system-setting.entity';
import { EmailVerificationToken } from './email-verification-token.entity';
import { LegalConsent } from './legal-consent.entity';
import { PasswordResetToken } from './password-reset-token.entity';
import { InfraCost } from './infra-cost.entity';

export const ALL_ENTITIES = [
  User,
  TaxpayerProfile,
  AccountantProfile,
  AccountantAuthorization,
  DocumentType,
  Document,
  QuotaLedger,
  QuotaPackage,
  AiCreditLedger,
  Payment,
  SubscriptionPlan,
  Subscription,
  RefreshToken,
  AuditLog,
  Note,
  Notification,
  Announcement,
  SystemSetting,
  EmailVerificationToken,
  LegalConsent,
  PasswordResetToken,
  InfraCost,
];

export {
  User,
  TaxpayerProfile,
  AccountantProfile,
  AccountantAuthorization,
  DocumentType,
  Document,
  QuotaLedger,
  QuotaPackage,
  AiCreditLedger,
  Payment,
  SubscriptionPlan,
  Subscription,
  RefreshToken,
  AuditLog,
  Note,
  Notification,
  Announcement,
  SystemSetting,
  EmailVerificationToken,
  LegalConsent,
  PasswordResetToken,
  InfraCost,
};
