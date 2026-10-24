import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

export enum SubscriptionStatus {
  TRIALING = 'trialing',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  EXPIRED = 'expired',
}

export enum BillingPeriod {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

/** Yürürlükte sayılan durumlar — bir kullanıcıda aynı anda yalnızca biri olabilir (DB'de UNIQUE). */
export const LIVE_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

/**
 * Kullanıcının aboneliği. "En fazla bir yürürlükteki abonelik" kuralı
 * `subscriptions.active_lock` UNIQUE indeksiyle veritabanında garanti — uygulama
 * katmanındaki yarış koşullarına güvenilmez (aynı desen: accountant_authorizations).
 */
@Entity('subscriptions')
@Index('idx_subscription_user', ['userId', 'status'])
export class Subscription {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'char', length: 36, generated: 'uuid' })
  uuid: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'plan_id', type: 'int', unsigned: true })
  planId: number;

  @ManyToOne(() => SubscriptionPlan)
  @JoinColumn({ name: 'plan_id' })
  plan?: SubscriptionPlan;

  @Column({ type: 'enum', enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Column({ name: 'billing_period', type: 'enum', enum: BillingPeriod, default: BillingPeriod.MONTHLY })
  billingPeriod: BillingPeriod;

  @Column({ name: 'current_period_start', type: 'datetime' })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'datetime' })
  currentPeriodEnd: Date;

  @Column({ name: 'cancel_at_period_end', type: 'tinyint', width: 1, default: 0 })
  cancelAtPeriodEnd: number;

  @Column({ name: 'canceled_at', type: 'datetime', nullable: true })
  canceledAt?: Date | null;

  /**
   * Gönderilmiş en dar yenileme hatırlatma eşiği (30 → 7 → 1 gün). Aynı eşiğin
   * ikinci kez gönderilmesini engeller; abonelik yenilenince NULL'a çekilir.
   */
  @Column({ name: 'renewal_reminder_days', type: 'int', nullable: true })
  renewalReminderDays?: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider?: string | null;

  @Column({ name: 'provider_ref', type: 'varchar', length: 191, nullable: true })
  providerRef?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
