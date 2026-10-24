import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLog, User } from '../../database/entities';
import { Cursor, Paginated } from '../../common/pagination/paginated';

export interface AuditEntry {
  actorUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  taxpayerId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogView extends AuditEntry {
  id: string;
  actorName: string;
  createdAt: Date;
}

export interface AuditLogQuery {
  entityType?: string;
  entityId?: string;
  /** 'ALL' = kapsam kısıtı yok (ör. admin); dizi boşsa hiç kayıt dönmez. */
  taxpayerIds?: string[] | 'ALL';
  action?: string;
  cursor?: string;
  /** Verilirse offset (sayfa numaralı) modu kullanılır — `cursor` yok sayılır. */
  page?: number;
  limit: number;
}

/** Denetim izi yazıcısı/okuyucusu. Kritik uçlardan (yükleme, yetki değişimi vb.) çağrılır. */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.repo.save(this.repo.create(entry));
  }

  /** Aktör adları çözülmüş, keyset sayfalı denetim izi listesi (ör. Evrak Logları sayfası). */
  async list(query: AuditLogQuery): Promise<Paginated<AuditLogView>> {
    if (Array.isArray(query.taxpayerIds) && query.taxpayerIds.length === 0) {
      return { items: [], nextCursor: null, limit: query.limit };
    }

    const qb = this.repo.createQueryBuilder('a');
    if (query.entityType) qb.andWhere('a.entityType = :et', { et: query.entityType });
    if (query.entityId) qb.andWhere('a.entityId = :eid', { eid: query.entityId });
    if (query.action) qb.andWhere('a.action = :act', { act: query.action });
    if (Array.isArray(query.taxpayerIds)) {
      qb.andWhere('a.taxpayerId IN (:...tids)', { tids: query.taxpayerIds });
    }
    let items: AuditLog[];
    let nextCursor: string | null = null;
    let extra: { total: number; page: number; totalPages: number } | undefined;

    if (query.page) {
      const total = await qb.clone().getCount();
      items = await qb.orderBy('a.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getMany();
      extra = { total, page: query.page, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
    } else {
      if (query.cursor) qb.andWhere('a.id < :cid', { cid: Cursor.decode(query.cursor) });
      qb.orderBy('a.id', 'DESC').take(query.limit + 1);
      const rows = await qb.getMany();
      const hasMore = rows.length > query.limit;
      items = hasMore ? rows.slice(0, query.limit) : rows;
      nextCursor = hasMore ? Cursor.encode(items[items.length - 1].id) : null;
    }

    const actorIds = [...new Set(items.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const actors = actorIds.length
      ? await this.users.find({ where: { id: In(actorIds) }, select: ['id', 'fullName', 'email'] })
      : [];
    const nameById = new Map(actors.map((u) => [u.id, u.fullName || u.email]));

    return {
      items: items.map((r) => ({
        id: r.id,
        actorUserId: r.actorUserId,
        actorName: (r.actorUserId && nameById.get(r.actorUserId)) || 'Silinmiş kullanıcı',
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        taxpayerId: r.taxpayerId,
        metadata: r.metadata,
        createdAt: r.createdAt,
      })),
      nextCursor,
      limit: query.limit,
      ...extra,
    };
  }
}
