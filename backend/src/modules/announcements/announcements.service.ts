import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Announcement, User } from '../../database/entities';
import { UserStatus } from '../../shared/enums';
import { Cursor, Paginated } from '../../common/pagination/paginated';
import { NotificationsService } from '../notifications/notifications.service';

/** Bildirimlerdeki `type` ayrımcısı — anasayfadaki "Bildirimler" widget'ı bunu hariç tutar. */
export const ANNOUNCEMENT_NOTIFICATION_TYPE = 'system_announcement';

/** Admin tarafından gönderilen, tüm kullanıcılara düşen sistem duyuruları. */
@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement) private readonly repo: Repository<Announcement>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  async list(cursor: string | null, limit: number): Promise<Paginated<Announcement>> {
    const qb = this.repo.createQueryBuilder('a');
    if (cursor) qb.andWhere('a.id < :cid', { cid: Cursor.decode(cursor) });
    qb.orderBy('a.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? Cursor.encode(items[items.length - 1].id) : null;
    return { items, nextCursor, limit };
  }

  /** Duyuruyu kaydeder ve tüm aktif kullanıcılara bildirim olarak düşürür. */
  async create(title: string, body: string, createdByUserId: string): Promise<Announcement> {
    const announcement = await this.repo.save(this.repo.create({ title, body, createdByUserId }));

    const activeUsers = await this.users.find({ where: { status: UserStatus.ACTIVE }, select: ['id'] });
    await this.notifications.createForUsers(
      activeUsers.map((u) => u.id),
      { type: ANNOUNCEMENT_NOTIFICATION_TYPE, title, body, metadata: { announcementId: announcement.id } },
    );

    return announcement;
  }

  async update(id: string, title?: string, body?: string): Promise<Announcement> {
    const announcement = await this.repo.findOneBy({ id });
    if (!announcement) throw new NotFoundException('Duyuru bulunamadı.');
    if (title !== undefined) announcement.title = title;
    if (body !== undefined) announcement.body = body;
    return this.repo.save(announcement);
  }

  /** Hard delete — soft-delete kolonu yok; notifications.metadata'daki referans gerçek bir FK değil, sarkan id zararsız. */
  async delete(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException('Duyuru bulunamadı.');
  }
}
