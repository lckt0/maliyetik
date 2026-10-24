import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification } from '../../database/entities';
import { Cursor, Paginated } from '../../common/pagination/paginated';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

/** Kullanıcıya özel bildirimler — zil ikonu dropdown'ı bunun üzerinden beslenir. */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
  ) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    return this.repo.save(this.repo.create(input));
  }

  /** Aynı bildirimi birden çok kullanıcıya tek seferde düşürür (ör. sistem duyurusu). */
  async createForUsers(userIds: string[], input: Omit<CreateNotificationInput, 'userId'>): Promise<void> {
    if (!userIds.length) return;
    const rows = userIds.map((userId) => this.repo.create({ ...input, userId }));
    await this.repo.save(rows);
  }

  async list(userId: string, cursor: string | null, limit: number, excludeType?: string): Promise<Paginated<Notification>> {
    const qb = this.repo.createQueryBuilder('n').where('n.userId = :uid', { uid: userId });
    if (excludeType) qb.andWhere('n.type != :excludeType', { excludeType });
    if (cursor) qb.andWhere('n.id < :cid', { cid: Cursor.decode(cursor) });
    qb.orderBy('n.id', 'DESC').take(limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? Cursor.encode(items[items.length - 1].id) : null;
    return { items, nextCursor, limit };
  }

  async unreadCount(userId: string): Promise<number> {
    // Not: `readAt: null` düz değer olarak verilirse TypeORM 0.3.x bu koşulu SESSİZCE
    // yok sayıp yalnızca userId'ye göre sayıyor (tüm bildirimleri "okunmamış" sayıyordu) —
    // IS NULL koşulu için mutlaka IsNull() operatörü kullanılmalı.
    return this.repo.count({ where: { userId, readAt: IsNull() } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Bildirim bulunamadı.');
    if (row.userId !== userId) throw new ForbiddenException('Bu bildirime erişim yetkiniz yok.');
    if (!row.readAt) await this.repo.update({ id }, { readAt: new Date() });
  }

  /**
   * Birden çok evrak için TEK sorguda "bu tür bir bildirim zaten var mı" kontrolü
   * (metadata.documentId) — periyodik taramanın her evrak için ayrı ayrı tam tablo
   * taraması yapmasını (N+1) önler.
   */
  async documentIdsWithExistingNotification(type: string, documentIds: string[]): Promise<Set<string>> {
    if (!documentIds.length) return new Set();
    const rows = await this.repo
      .createQueryBuilder('n')
      .select("JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.documentId'))", 'documentId')
      .where('n.type = :type', { type })
      .andWhere("JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.documentId')) IN (:...ids)", { ids: documentIds })
      .getRawMany<{ documentId: string }>();
    return new Set(rows.map((r) => r.documentId));
  }

  async markAllRead(userId: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('user_id = :uid AND read_at IS NULL', { uid: userId })
      .execute();
  }
}
