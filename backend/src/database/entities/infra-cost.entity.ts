import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { InfraCostBillingCycle, InfraCostCategory } from '../../shared/enums';

/** Admin'in elle işlediği altyapı/servis maliyeti kaydı (sunucu, hosting, veritabanı, depolama, domain, e-posta, vb.). */
@Entity('infra_costs')
@Index('idx_infra_cost_category', ['category', 'isActive'])
export class InfraCost {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'enum', enum: InfraCostCategory, default: InfraCostCategory.OTHER })
  category: InfraCostCategory;

  @Column({ length: 100, nullable: true })
  provider?: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @Column({ name: 'billing_cycle', type: 'enum', enum: InfraCostBillingCycle, default: InfraCostBillingCycle.MONTHLY })
  billingCycle: InfraCostBillingCycle;

  @Column({ name: 'next_billing_date', type: 'date', nullable: true })
  nextBillingDate?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note?: string;

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
