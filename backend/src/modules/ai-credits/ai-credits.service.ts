import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AiCreditLedger, User } from '../../database/entities';
import { AiCreditReason } from '../../shared/enums';
import { Cursor, Paginated } from '../../common/pagination/paginated';

export interface AiCreditUserSearchResult {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  aiCreditsLimit: number;
  aiCreditsUsed: number;
}

export interface AiCreditLedgerEntry {
  id: string;
  changeAmount: number;
  balanceAfter: number;
  reason: AiCreditReason;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdAt: Date;
}

/**
 * AI kredisi muhasebesi — `QuotaService` ile birebir aynı desen (satır kilidi +
 * ledger audit), yalnızca `taxpayer_profiles` yerine `users` üzerinde. Evrak
 * Dijitalleştir (AI) her denemede (kaç model kademesi denenirse denensin) 1
 * kredi düşer; başarısız Gemini çağrısında `refund` ile iade edilir.
 */
@Injectable()
export class AiCreditsService {
  constructor(private readonly dataSource: DataSource) {}

  async consume(userId: string, amount = 1, referenceId?: string, manager?: EntityManager): Promise<{ remaining: number }> {
    const run = async (tx: EntityManager) => {
      const u = await tx
        .createQueryBuilder(User, 'u')
        .setLock('pessimistic_write')
        .where('u.id = :id', { id: userId })
        .getOne();
      if (!u) throw new NotFoundException('Kullanıcı bulunamadı.');

      const limit = Number(u.aiCreditsLimit);
      const used = Number(u.aiCreditsUsed);
      if (used + amount > limit) {
        throw new ForbiddenException('Yapay zeka krediniz yetersiz. Lütfen yöneticinizden kredi talep edin.');
      }

      const newUsed = used + amount;
      await tx.update(User, { id: userId }, { aiCreditsUsed: String(newUsed) });
      await tx.save(
        tx.create(AiCreditLedger, {
          userId,
          changeAmount: String(-amount),
          balanceAfter: String(limit - newUsed),
          reason: AiCreditReason.CONSUME,
          referenceType: referenceId ? 'document' : undefined,
          referenceId,
        }),
      );
      return { remaining: limit - newUsed };
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /** Başarısız AI denemesinde (Gemini hatası) tüketilen krediyi iade eder. */
  async refund(userId: string, amount = 1, referenceId?: string, note?: string): Promise<void> {
    await this.dataSource.transaction(async (tx) => {
      const u = await tx
        .createQueryBuilder(User, 'u')
        .setLock('pessimistic_write')
        .where('u.id = :id', { id: userId })
        .getOne();
      if (!u) throw new NotFoundException('Kullanıcı bulunamadı.');

      const newUsed = Math.max(0, Number(u.aiCreditsUsed) - amount);
      await tx.update(User, { id: userId }, { aiCreditsUsed: String(newUsed) });
      await tx.save(
        tx.create(AiCreditLedger, {
          userId,
          changeAmount: String(amount),
          balanceAfter: String(Number(u.aiCreditsLimit) - newUsed),
          reason: AiCreditReason.REFUND,
          referenceType: referenceId ? 'document' : undefined,
          referenceId,
          note,
        }),
      );
    });
  }

  /** Admin kredi tahsis/iade eder (limit artar). */
  async grant(userId: string, amount: number, reason: AiCreditReason, note?: string): Promise<void> {
    await this.dataSource.transaction(async (tx) => {
      const u = await tx
        .createQueryBuilder(User, 'u')
        .setLock('pessimistic_write')
        .where('u.id = :id', { id: userId })
        .getOne();
      if (!u) throw new NotFoundException('Kullanıcı bulunamadı.');

      const newLimit = Number(u.aiCreditsLimit) + amount;
      await tx.update(User, { id: userId }, { aiCreditsLimit: String(newLimit) });
      await tx.save(
        tx.create(AiCreditLedger, {
          userId,
          changeAmount: String(amount),
          balanceAfter: String(newLimit - Number(u.aiCreditsUsed)),
          reason,
          note,
        }),
      );
    });
  }

  async summary(userId: string): Promise<{ limit: number; used: number; remaining: number }> {
    const u = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('Kullanıcı bulunamadı.');
    const limit = Number(u.aiCreditsLimit);
    const used = Number(u.aiCreditsUsed);
    return { limit, used, remaining: limit - used };
  }

  /** Admin'in kredi tahsis ederken kullanıcı aramak için kullandığı uç — ad, e-posta veya role göre. */
  async searchUsers(search: string, limit: number): Promise<AiCreditUserSearchResult[]> {
    const qb = this.dataSource
      .createQueryBuilder(User, 'u')
      .where("u.role IN ('taxpayer','accountant')")
      .select([
        'u.id AS userId',
        'u.full_name AS fullName',
        'u.email AS email',
        'u.role AS role',
        'u.ai_credits_limit AS aiCreditsLimit',
        'u.ai_credits_used AS aiCreditsUsed',
      ])
      .take(limit);

    if (search) {
      qb.andWhere('(u.full_name LIKE :s OR u.email LIKE :s)', { s: `%${search}%` });
    }
    qb.orderBy('u.full_name', 'ASC');

    const rows = await qb.getRawMany<{
      userId: string; fullName: string; email: string; role: string; aiCreditsLimit: string; aiCreditsUsed: string;
    }>();
    return rows.map((r) => ({
      userId: r.userId,
      fullName: r.fullName,
      email: r.email,
      role: r.role,
      aiCreditsLimit: Number(r.aiCreditsLimit),
      aiCreditsUsed: Number(r.aiCreditsUsed),
    }));
  }

  async ledgerHistory(userId: string, cursor: string | undefined, limit: number, page?: number): Promise<Paginated<AiCreditLedgerEntry>> {
    const qb = this.dataSource
      .createQueryBuilder(AiCreditLedger, 'l')
      .where('l.userId = :userId', { userId });

    let items: AiCreditLedger[];
    let nextCursor: string | null = null;
    let extra: { total: number; page: number; totalPages: number } | undefined;

    if (page) {
      const total = await qb.clone().getCount();
      items = await qb.orderBy('l.id', 'DESC').skip((page - 1) * limit).take(limit).getMany();
      extra = { total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
    } else {
      if (cursor) qb.andWhere('l.id < :cid', { cid: Cursor.decode(cursor) });
      qb.orderBy('l.id', 'DESC').take(limit + 1);
      const rows = await qb.getMany();
      const hasMore = rows.length > limit;
      items = hasMore ? rows.slice(0, limit) : rows;
      nextCursor = hasMore ? Cursor.encode(items[items.length - 1].id) : null;
    }

    return {
      items: items.map((r) => ({
        id: r.id,
        changeAmount: Number(r.changeAmount),
        balanceAfter: Number(r.balanceAfter),
        reason: r.reason,
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        note: r.note,
        createdAt: r.createdAt,
      })),
      nextCursor,
      limit,
      ...extra,
    };
  }
}
