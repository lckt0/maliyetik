import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

/** Kayıt sonrası e-posta doğrulama — ham token yalnızca e-postadaki linkte, burada SHA-256 hash'i saklanır. */
@Entity('email_verification_tokens')
@Index('idx_email_verif_user', ['userId', 'expiresAt'])
export class EmailVerificationToken {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'token_hash', type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @Column({ name: 'consumed_at', type: 'datetime', nullable: true })
  consumedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
