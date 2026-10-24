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

/**
 * Yasal metin onaylarının kanıtı.
 *
 * KVKK'da ispat yükü veri sorumlusundadır: "kullanıcı kabul etti" demek yetmez,
 * NE ZAMAN, HANGİ SÜRÜMÜ, NEREDEN kabul ettiği gösterilebilmelidir. Metinler
 * sürümlendiği için (bkz. frontend/src/legal/firma.ts → YASAL_SURUM) onay da
 * sürümle birlikte saklanır; metin değişince eski onaylar geçerliliğini korur
 * ama yeni sürüm için yeniden onay istenebilir.
 *
 * Onay geri alınabilir (açık rıza): satır SİLİNMEZ, `revoked_at` doldurulur —
 * geri alma da ispatlanması gereken bir olaydır.
 */
@Entity('legal_consents')
@Index('idx_legal_consent_user', ['userId', 'document'])
export class LegalConsent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Metnin slug'ı: kullanim-kosullari, gizlilik, aydinlatma, acik-riza-yapay-zeka, acik-riza-pazarlama */
  @Column({ name: 'document', type: 'varchar', length: 60 })
  document: string;

  @Column({ name: 'version', type: 'varchar', length: 20 })
  version: string;

  /** Onayın alındığı IP — ispat için. Proxy arkasında X-Forwarded-For'un ilk değeri. */
  @Column({ name: 'ip', type: 'varchar', length: 45, nullable: true })
  ip?: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent?: string;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
