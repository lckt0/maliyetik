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

/** JWT refresh rotasyonu — token'ın ham hali değil SHA-256 hash'i saklanır. */
@Entity('refresh_tokens')
@Index('idx_refresh_user', ['userId', 'expiresAt'])
export class RefreshToken {
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

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt?: Date;

  @Column({ name: 'user_agent', length: 255, nullable: true })
  userAgent?: string;

  @Column({ name: 'ip_address', type: 'varbinary', length: 16, nullable: true })
  ipAddress?: Buffer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
