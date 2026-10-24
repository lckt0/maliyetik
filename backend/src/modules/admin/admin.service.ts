import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document, User } from '../../database/entities';
import { Role, UserStatus } from '../../shared/enums';
import { RedisService } from '../../infrastructure/redis/redis.service';

const STATS_CACHE_KEY = 'admin:stats:v1';
const STATS_CACHE_TTL_SECONDS = 20;

export interface AdminStats {
  users: {
    total: number;
    taxpayers: number;
    accountants: number;
    admins: number;
    active: number;
    suspended: number;
    pending: number;
  };
  documents: {
    count: number;
    totalBytes: number;
  };
}

/** Admin paneli iş istatistikleri (kullanıcı/evrak sayıları) — sistem kaynak metrikleri için bkz. SystemMetricsService. */
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly redis: RedisService,
  ) {}

  async getStats(): Promise<AdminStats> {
    const cached = await this.redis.client.get(STATS_CACHE_KEY).catch(() => null);
    if (cached) return JSON.parse(cached) as AdminStats;

    const stats = await this.computeStats();
    await this.redis.client.set(STATS_CACHE_KEY, JSON.stringify(stats), 'EX', STATS_CACHE_TTL_SECONDS).catch(() => undefined);
    return stats;
  }

  private async computeStats(): Promise<AdminStats> {
    const roleStatusRows = await this.users
      .createQueryBuilder('u')
      .select('u.role', 'role')
      .addSelect('u.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('u.deleted_at IS NULL')
      .groupBy('u.role')
      .addGroupBy('u.status')
      .getRawMany<{ role: Role; status: UserStatus; count: string }>();

    const users = { total: 0, taxpayers: 0, accountants: 0, admins: 0, active: 0, suspended: 0, pending: 0 };
    for (const row of roleStatusRows) {
      const count = Number(row.count);
      users.total += count;
      if (row.role === Role.TAXPAYER) users.taxpayers += count;
      else if (row.role === Role.ACCOUNTANT) users.accountants += count;
      else if (row.role === Role.ADMIN) users.admins += count;

      if (row.status === UserStatus.ACTIVE) users.active += count;
      else if (row.status === UserStatus.SUSPENDED) users.suspended += count;
      else if (row.status === UserStatus.PENDING) users.pending += count;
    }

    const docRow = await this.documents
      .createQueryBuilder('d')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(d.file_size), 0)', 'totalBytes')
      .where('d.deleted_at IS NULL')
      .getRawOne<{ count: string; totalBytes: string }>();

    return {
      users,
      documents: {
        count: Number(docRow?.count ?? 0),
        totalBytes: Number(docRow?.totalBytes ?? 0),
      },
    };
  }
}
