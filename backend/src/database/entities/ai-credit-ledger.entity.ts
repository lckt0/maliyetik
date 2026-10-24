import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AiCreditReason } from '../../shared/enums';
import { User } from './user.entity';

@Entity('ai_credit_ledger')
@Index('idx_ai_credit_user_created', ['userId', 'createdAt'])
export class AiCreditLedger {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'change_amount', type: 'bigint' })
  changeAmount: string;

  @Column({ name: 'balance_after', type: 'bigint' })
  balanceAfter: string;

  @Column({ type: 'enum', enum: AiCreditReason })
  reason: AiCreditReason;

  @Column({ name: 'reference_type', length: 50, nullable: true })
  referenceType?: string;

  @Column({ name: 'reference_id', type: 'bigint', unsigned: true, nullable: true })
  referenceId?: string;

  @Column({ length: 255, nullable: true })
  note?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
