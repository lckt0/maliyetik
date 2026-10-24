import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuotaReason } from '../../shared/enums';
import { TaxpayerProfile } from './taxpayer-profile.entity';

@Entity('quota_ledger')
@Index('idx_quota_taxpayer_created', ['taxpayerId', 'createdAt'])
export class QuotaLedger {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'taxpayer_id', type: 'bigint', unsigned: true })
  taxpayerId: string;

  @ManyToOne(() => TaxpayerProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'taxpayer_id' })
  taxpayer: TaxpayerProfile;

  @Column({ name: 'change_amount', type: 'bigint' })
  changeAmount: string;

  @Column({ name: 'balance_after', type: 'bigint' })
  balanceAfter: string;

  @Column({ type: 'enum', enum: QuotaReason })
  reason: QuotaReason;

  @Column({ name: 'reference_type', length: 50, nullable: true })
  referenceType?: string;

  @Column({ name: 'reference_id', type: 'bigint', unsigned: true, nullable: true })
  referenceId?: string;

  @Column({ length: 255, nullable: true })
  note?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
