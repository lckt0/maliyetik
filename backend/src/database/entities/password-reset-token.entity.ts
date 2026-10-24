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

/** Şifre sıfırlama bağlantıları — ham token yalnızca linkte, burada SHA-256 hash'i saklanır (email_verification_tokens ile aynı desen). */
@Entity('password_reset_tokens')
@Index('idx_password_reset_user', ['userId', 'expiresAt'])
export class PasswordResetToken {
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
