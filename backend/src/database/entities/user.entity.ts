import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role, UserStatus } from '../../shared/enums';
import { UiPreferences } from '../../shared/ui-preferences';
import { TaxpayerProfile } from './taxpayer-profile.entity';
import { AccountantProfile } from './accountant-profile.entity';

@Entity('users')
@Index('idx_users_role_status', ['role', 'status'])
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'char', length: 36, generated: 'uuid' })
  uuid: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ name: 'full_name', length: 150 })
  fullName: string;

  @Column({ length: 20, nullable: true })
  phone?: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  /** [a-z0-9_], herkese açık profil URL'i (<site>/u/:username) için. */
  @Column({ length: 30, nullable: true })
  username?: string;

  /** Zengin metin biyografi — kaydedilmeden önce allowlist ile sanitize edilir. */
  @Column({ type: 'text', nullable: true })
  bio?: string;

  /** Depolamadaki (GCS) profil fotoğrafı yolu; sunulurken imzalı URL üretilir. */
  @Column({ name: 'avatar_path', length: 500, nullable: true })
  avatarPath?: string;

  /** true ise profil /u/:username üzerinden girişsiz herkese açık görüntülenir. */
  @Column({ name: 'is_public', type: 'tinyint', width: 1, default: 0, transformer: { to: (v: boolean) => (v ? 1 : 0), from: (v: number) => !!v } })
  isPublic: boolean;

  /** Tema, sol/sağ kenar çubuğu sabitleme durumu gibi arayüz tercihleri — cihazlar arası senkron. */
  @Column({ name: 'ui_preferences', type: 'json', nullable: true })
  uiPreferences?: UiPreferences | null;

  @Column({ name: 'email_verified_at', type: 'datetime', nullable: true })
  emailVerifiedAt?: Date;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt?: Date;

  /** Evrak Dijitalleştir (AI) kredisi — bkz. AiCreditsService/ai_credit_ledger. */
  @Column({ name: 'ai_credits_limit', type: 'bigint', unsigned: true, default: 0 })
  aiCreditsLimit: string;

  @Column({ name: 'ai_credits_used', type: 'bigint', unsigned: true, default: 0 })
  aiCreditsUsed: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;

  @OneToOne(() => TaxpayerProfile, (t) => t.user)
  taxpayerProfile?: TaxpayerProfile;

  @OneToOne(() => AccountantProfile, (a) => a.user)
  accountantProfile?: AccountantProfile;
}
