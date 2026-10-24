import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum PlanAudience {
  TAXPAYER = 'taxpayer',
  ACCOUNTANT = 'accountant',
}

/**
 * Satılabilir abonelik planı. Fiyatlar ve içerikler admin panelinden düzenlenir; kod
 * (`code`) sabit kalır çünkü ödeme sağlayıcısındaki ürün eşlemesi buna dayanacak.
 */
@Entity('subscription_plans')
@Index('idx_plan_audience', ['audience', 'isActive', 'sortOrder'])
export class SubscriptionPlan {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'enum', enum: PlanAudience })
  audience: PlanAudience;

  @Column({ name: 'price_monthly', type: 'decimal', precision: 10, scale: 2, default: 0 })
  priceMonthly: string;

  @Column({ name: 'price_yearly', type: 'decimal', precision: 10, scale: 2, default: 0 })
  priceYearly: string;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'included_quota', type: 'bigint', unsigned: true, default: 0 })
  includedQuota: string;

  /**
   * Müşavir planlarında bir KOLTUĞUN (yani bir mükellefin) evrak tavanı. Mükellef
   * planlarında 0'dır — orada tavan `included_quota`dan gelir.
   */
  @Column({ name: 'quota_per_seat', type: 'bigint', unsigned: true, default: 0 })
  quotaPerSeat: string;

  @Column({ name: 'included_ai_credits', type: 'bigint', unsigned: true, default: 0 })
  includedAiCredits: string;

  /** 0 = sınırsız. Yalnızca müşavir planlarında anlamlı. */
  @Column({ name: 'max_taxpayers', type: 'int', unsigned: true, default: 0 })
  maxTaxpayers: number;

  @Column({ name: 'trial_days', type: 'smallint', unsigned: true, default: 0 })
  trialDays: number;

  /** Fiyat kartında madde madde gösterilen özellikler. */
  @Column({ type: 'json', nullable: true })
  features?: string[] | null;

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive: number;

  /** Kapalıysa yalnızca admin atayabilir (özel/kurumsal planlar). */
  @Column({ name: 'is_public', type: 'tinyint', width: 1, default: 1 })
  isPublic: number;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
