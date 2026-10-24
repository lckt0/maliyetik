import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Document, InfraCost } from '../../database/entities';
import { AdminAuditAction, InfraCostBillingCycle } from '../../shared/enums';
import { AuditService } from '../audit/audit.service';
import { CreateInfraCostDto } from './dto/create-infra-cost.dto';
import { UpdateInfraCostDto } from './dto/update-infra-cost.dto';

export interface InfraCostSummary {
  totalMonthlyEquivalent: number;
  byCategory: { category: string; monthlyEquivalent: number }[];
}

/** Yıllık ödemeleri aylık eşdeğere çevirir, tek seferlik ödemeleri toplama katmaz. */
function monthlyEquivalent(amount: number, cycle: InfraCostBillingCycle): number {
  if (cycle === InfraCostBillingCycle.YEARLY) return amount / 12;
  if (cycle === InfraCostBillingCycle.ONE_TIME) return 0;
  return amount;
}

@Injectable()
export class InfraCostsService {
  constructor(
    @InjectRepository(InfraCost) private readonly repo: Repository<InfraCost>,
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly audit: AuditService,
  ) {}

  /** GCS'de tuttuğumuz toplam evrak boyutu — depolama maliyeti kartı için canlı kullanım göstergesi. */
  async getStorageUsageBytes(): Promise<number> {
    const row = await this.documents
      .createQueryBuilder('d')
      .select('COALESCE(SUM(d.file_size), 0)', 'totalBytes')
      .where('d.deleted_at IS NULL')
      .getRawOne<{ totalBytes: string }>();
    return Number(row?.totalBytes ?? 0);
  }

  async list(): Promise<{ items: InfraCost[]; summary: InfraCostSummary }> {
    const items = await this.repo.find({ where: { isActive: 1 }, order: { category: 'ASC', name: 'ASC' } });
    const byCategoryMap = new Map<string, number>();
    let total = 0;
    for (const item of items) {
      const monthly = monthlyEquivalent(Number(item.amount), item.billingCycle);
      total += monthly;
      byCategoryMap.set(item.category, (byCategoryMap.get(item.category) ?? 0) + monthly);
    }
    return {
      items,
      summary: {
        totalMonthlyEquivalent: total,
        byCategory: [...byCategoryMap.entries()].map(([category, monthlyEquivalent]) => ({ category, monthlyEquivalent })),
      },
    };
  }

  async create(dto: CreateInfraCostDto, actorUserId: string): Promise<InfraCost> {
    const entity = this.repo.create({ ...dto, amount: String(dto.amount), currency: dto.currency ?? 'TRY' });
    const saved = await this.repo.save(entity);
    await this.audit.log({
      actorUserId, action: AdminAuditAction.INFRA_COST_CREATED, entityType: 'infra_cost', entityId: saved.id,
      metadata: { name: saved.name, amount: saved.amount },
    });
    return saved;
  }

  async update(id: string, dto: UpdateInfraCostDto, actorUserId: string): Promise<InfraCost> {
    const existing = await this.findOrThrow(id);
    const next = this.repo.merge(existing, {
      ...dto,
      amount: dto.amount != null ? String(dto.amount) : undefined,
      isActive: dto.isActive != null ? Number(dto.isActive) : undefined,
    });
    const saved = await this.repo.save(next);
    await this.audit.log({ actorUserId, action: AdminAuditAction.INFRA_COST_UPDATED, entityType: 'infra_cost', entityId: id });
    return saved;
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    await this.findOrThrow(id);
    await this.repo.delete(id);
    await this.audit.log({ actorUserId, action: AdminAuditAction.INFRA_COST_DELETED, entityType: 'infra_cost', entityId: id });
  }

  private async findOrThrow(id: string): Promise<InfraCost> {
    const item = await this.repo.findOneBy({ id });
    if (!item) throw new NotFoundException('Maliyet kaydı bulunamadı.');
    return item;
  }
}
