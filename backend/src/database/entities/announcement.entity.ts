import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Admin tarafından gönderilen sistem duyuruları. Gönderildiğinde tüm aktif
 * kullanıcılara `notifications` tablosunda bir kayıt da oluşturulur (bkz.
 * AnnouncementsService.create) — böylece zil ikonunda da görünür; anasayfadaki
 * "Bildirimler" widget'ı ise `type=system_announcement` olanları hariç tutar,
 * onlar yalnızca ayrı "Sistem Duyuruları" bölümünde (bu tablodan) listelenir.
 */
@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'created_by_user_id', type: 'bigint', unsigned: true, nullable: true })
  createdByUserId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
