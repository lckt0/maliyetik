import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Note, User } from '../../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import { CreateNoteDto, UpdateNoteDto } from './dto/note.dto';

export const NOTE_REMINDER_TYPE = 'note_reminder';

/** Tek turda gönderilecek azami hatırlatma — bir aksaklık sonrası birikmiş kuyruk API'yi boğmasın. */
const MAX_REMINDERS_PER_TICK = 200;

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    @InjectRepository(Note) private readonly notes: Repository<Note>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  async list(userId: string): Promise<Note[]> {
    return this.notes.find({
      where: { userId },
      // Sabitlenenler üstte, tamamlananlar altta, sonra en son güncellenen.
      order: { pinned: 'DESC', doneAt: 'ASC', updatedAt: 'DESC' },
      take: 200,
    });
  }

  async create(userId: string, dto: CreateNoteDto): Promise<Note> {
    const note = this.notes.create({
      userId,
      content: dto.content.trim(),
      pinned: dto.pinned ? 1 : 0,
      remindAt: dto.remindAt ? new Date(dto.remindAt) : null,
    });
    return this.notes.save(note);
  }

  async update(userId: string, id: string, dto: UpdateNoteDto): Promise<Note> {
    const note = await this.ownedOrThrow(userId, id);
    if (dto.content !== undefined) note.content = dto.content.trim();
    if (dto.pinned !== undefined) note.pinned = dto.pinned ? 1 : 0;
    if (dto.done !== undefined) note.doneAt = dto.done ? new Date() : null;
    if (dto.remindAt !== undefined) {
      note.remindAt = dto.remindAt ? new Date(dto.remindAt) : null;
      // Tarih değiştirildiğinde hatırlatma yeniden gönderilebilmeli.
      note.remindedAt = null;
    }
    return this.notes.save(note);
  }

  async remove(userId: string, id: string): Promise<void> {
    const note = await this.ownedOrThrow(userId, id);
    await this.notes.delete({ id: note.id });
  }

  private async ownedOrThrow(userId: string, id: string): Promise<Note> {
    const note = await this.notes.findOne({ where: { id } });
    if (!note) throw new NotFoundException('Not bulunamadı.');
    if (String(note.userId) !== String(userId)) throw new ForbiddenException('Bu nota erişim yetkiniz yok.');
    return note;
  }

  /**
   * Vakti gelmiş hatırlatıcıları gönderir. Dakikada bir çalışır: kullanıcı hatırlatmayı
   * dakika hassasiyetinde kurabiliyor, daha seyrek bir tur gecikme hissi yaratırdı.
   *
   * `remindedAt` damgası aynı hatırlatmanın iki kez düşmesini engeller; damga
   * GÖNDERİMDEN ÖNCE atılır — e-posta sağlayıcısı hata verirse kullanıcı bildirimi yine
   * de görür ve tekrar tekrar denenip spam üretilmez.
   */
  @Cron('30 * * * * *')
  async dispatchDueReminders(): Promise<void> {
    const due = await this.notes.find({
      where: { remindedAt: IsNull(), remindAt: LessThanOrEqual(new Date()) },
      order: { remindAt: 'ASC' },
      take: MAX_REMINDERS_PER_TICK,
    });
    if (!due.length) return;

    const now = new Date();
    await this.notes.update(due.map((n) => n.id), { remindedAt: now });

    for (const note of due) {
      try {
        const preview = note.content.length > 120 ? `${note.content.slice(0, 117)}…` : note.content;
        await this.notifications.create({
          userId: note.userId,
          type: NOTE_REMINDER_TYPE,
          title: 'Not hatırlatması',
          body: preview,
          metadata: { noteId: note.id },
        });

        const user = await this.users.findOne({ where: { id: note.userId } });
        // E-posta yalnızca kullanıcı kapatmadıysa; tercih hiç kaydedilmemişse açık kabul edilir.
        if (user?.email && user.uiPreferences?.emailReminders !== false) {
          await this.mail.sendNoteReminder(user.email, user.fullName ?? '', preview, note.remindAt ?? now);
        }
      } catch (err) {
        this.logger.error(`Not hatırlatması gönderilemedi (note=${note.id}): ${(err as Error).message}`);
      }
    }
  }
}
