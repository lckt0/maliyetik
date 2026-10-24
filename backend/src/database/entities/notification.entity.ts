import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Kullanıcıya özel bildirimler (ör. olası çift evrak uyarısı). `type` serbest bir
 * ayrımcı — ileride başka bildirim türleri (yetkilendirme, kota vb.) aynı tabloyu kullanabilir.
 */
@Entity('notifications')
@Index('idx_notif_user_created', ['userId', 'createdAt'])
@Index('idx_notif_user_unread', ['userId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @Column({ length: 50 })
  type: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  body?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ name: 'read_at', type: 'datetime', nullable: true })
  readAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
