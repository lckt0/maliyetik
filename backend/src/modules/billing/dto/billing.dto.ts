import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { BillingPeriod } from '../../../database/entities/subscription.entity';

export class StartSubscriptionDto {
  @IsInt()
  @IsPositive()
  planId: number;

  /**
   * Tüm planlar yıllık. Alan geriye dönük uyum için duruyor ama yalnızca
   * `yearly` kabul ediliyor; gönderilmezse de yıllık varsayılır.
   */
  @IsOptional()
  @IsIn([BillingPeriod.YEARLY])
  billingPeriod?: BillingPeriod;
}

export class StartPackageDto {
  @IsInt()
  @IsPositive()
  packageId: number;

  /** Kotanın yükleneceği mükellef — müşavir kendi mükellefi adına satın alabilir. */
  @IsString()
  taxpayerId: string;
}

/** Admin'in bir kullanıcıya elle plan ataması (POS entegrasyonu gelene kadar tek yol). */
export class AssignPlanDto {
  @IsString()
  userId: string;

  @IsInt()
  @IsPositive()
  planId: number;

  @IsOptional()
  @IsIn([BillingPeriod.YEARLY])
  billingPeriod?: BillingPeriod;

  @IsOptional()
  @IsBoolean()
  trial?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsOptional() @IsString() priceMonthly?: string;
  @IsOptional() @IsString() priceYearly?: string;
  @IsOptional() @IsInt() includedQuota?: number;
  @IsOptional() @IsInt() includedAiCredits?: number;
  @IsOptional() @IsInt() maxTaxpayers?: number;
  @IsOptional() @IsInt() trialDays?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

/** Elle mutabakat: Shopier panosundaki işlem referansı ve serbest not. */
export class ReconcilePaymentDto {
  @IsOptional() @IsString() @MaxLength(191) providerRef?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export class FailPaymentDto {
  @IsString() @MaxLength(255) reason: string;
}
