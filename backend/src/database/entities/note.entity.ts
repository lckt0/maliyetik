import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * Kullanıcının kişisel notu. `remindAt` doluysa o an geldiğinde bildirim (+ tercihe
 * göre e-posta) gönderilir ve `remindedAt` damgalanır — aynı hatırlatma iki kez düşmez.
 */
@Entity('notes')
@Index('idx_note_user', ['userId', 'pinned', 'updatedAt'])
@Index('idx_note_due', ['remindedAt', 'remindAt'])
export class Note {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ type: 'char', length: 36, generated: 'uuid' })
  uuid: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  pinned: number;

  /** Not tamamlandı olarak işaretlendiyse zaman damgası — liste altına düşer. */
  @Column({ name: 'done_at', type: 'datetime', nullable: true })
  doneAt?: Date | null;

  @Column({ name: 'remind_at', type: 'datetime', nullable: true })
  remindAt?: Date | null;

  @Column({ name: 'reminded_at', type: 'datetime', nullable: true })
  remindedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
