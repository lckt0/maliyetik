import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaxpayerProfile } from './taxpayer-profile.entity';
import { QuotaPackage } from './quota-package.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

/** Ödemenin neyin karşılığı olduğu — tahsilat sonrası hangi hakkın verileceğini belirler. */
export enum PaymentKind {
  SUBSCRIPTION = 'subscription',
  QUOTA_PACKAGE = 'quota_package',
  AI_CREDITS = 'ai_credits',
}

/**
 * Ödeme kaydı. Sanal POS entegrasyonu gelene kadar yalnızca `mock` sağlayıcıyla
 * (ve admin'in elle işaretlemesiyle) dolar; sağlayıcı eklendiğinde aynı satırlar
 * kullanılır — `provider` + `provider_ref` sağlayıcıdaki işlemi işaret eder.
 */
@Entity('payments')
@Index('idx_payment_taxpayer_status', ['taxpayerId', 'status'])
export class Payment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'char', length: 36, generated: 'uuid' })
  uuid: string;

  /** Kota/AI kredisi satın alımlarında dolu — hak bu mükellefe yazılır. */
  @Column({ name: 'taxpayer_id', type: 'bigint', unsigned: true, nullable: true })
  taxpayerId?: string | null;

  @ManyToOne(() => TaxpayerProfile, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'taxpayer_id' })
  taxpayer?: TaxpayerProfile | null;

  /** Ödemeyi yapan kullanıcı — abonelik ödemelerinde tek bağ budur (müşavirin mükellefi yok). */
  @Column({ name: 'user_id', type: 'bigint', unsigned: true, nullable: true })
  userId?: string | null;

  @Column({ type: 'enum', enum: PaymentKind, default: PaymentKind.QUOTA_PACKAGE })
  kind: PaymentKind;

  @Column({ name: 'subscription_id', type: 'bigint', unsigned: true, nullable: true })
  subscriptionId?: string | null;

  @Column({ name: 'package_id', type: 'int', unsigned: true, nullable: true })
  packageId?: number;

  @ManyToOne(() => QuotaPackage, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'package_id' })
  package?: QuotaPackage;

  @Column({ length: 50, nullable: true })
  provider?: string;

  @Column({ name: 'provider_ref', length: 191, nullable: true })
  providerRef?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'quota_granted', type: 'bigint', unsigned: true, default: 0 })
  quotaGranted: string;

  @Column({ name: 'ai_credits_granted', type: 'bigint', unsigned: true, default: 0 })
  aiCreditsGranted: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string | null;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ name: 'failure_reason', type: 'varchar', length: 255, nullable: true })
  failureReason?: string | null;

  /** Sağlayıcının ham yanıtı — uyuşmazlık/iade incelemelerinde tek kanıt. */
  @Column({ name: 'provider_payload', type: 'json', nullable: true })
  providerPayload?: Record<string, unknown> | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
