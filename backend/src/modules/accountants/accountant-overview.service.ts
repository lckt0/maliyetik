import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AccountantAuthorization, Document, DocumentType, TaxpayerProfile,
} from '../../database/entities';
import { AuthUser } from '../../common/types/auth-user';
import { AuthorizationStatus, DocumentCategory, DocumentStatus } from '../../shared/enums';

export interface TaxpayerOverviewRow {
  taxpayerId: string;
  companyTitle: string;
  vknTckn: string;
  /** Bu ay yüklenen evrak sayısı. */
  documentsThisMonth: number;
  /** Alanları eksik (Evrak Dijitalleştir kuyruğunda bekleyen) evrak sayısı. */
  pendingDigitize: number;
  /** Eksik ZORUNLU şirket evrağı sayısı (imza sirküsü, vergi levhası…). */
  missingCompanyDocs: number;
  /** En son evrak yükleme zamanı — hiç yoksa null. */
  lastUploadAt: string | null;
  quotaLimit: number;
  quotaUsed: number;
  /** Mükellef kota görünürlüğünü kapattıysa false — sayılar gizlenir. */
  quotaVisible: boolean;
}

/**
 * Mali müşavirin TÜM mükelleflerini tek ekranda karşılaştırmasını sağlayan özet.
 *
 * Müşavir paneli mükellef panelinin birebir kopyasıydı: her şey "seçili mükellef"
 * üzerinden çalışıyor, müşavir hangi mükellefine dönmesi gerektiğini ancak tek tek
 * gezerek anlayabiliyordu. Bu uç, ayın kapanışında "kimde eksik var" sorusunu tek
 * bakışta cevaplar.
 *
 * Tüm sayımlar mükellef başına ayrı sorgu yerine TEK sorguda (GROUP BY) toplanır —
 * 50 mükellefli bir ofiste N+1 sorgu kabul edilemez.
 */
@Injectable()
export class AccountantOverviewService {
  constructor(
    @InjectRepository(AccountantAuthorization) private readonly auths: Repository<AccountantAuthorization>,
    @InjectRepository(TaxpayerProfile) private readonly taxpayers: Repository<TaxpayerProfile>,
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(DocumentType) private readonly types: Repository<DocumentType>,
  ) {}

  async overview(user: AuthUser): Promise<TaxpayerOverviewRow[]> {
    if (!user.accountantId) return [];

    const auths = await this.auths.find({
      where: { accountantId: user.accountantId, status: AuthorizationStatus.ACTIVE },
      relations: { taxpayer: true },
    });
    const taxpayerIds = auths.map((a) => a.taxpayerId);
    if (!taxpayerIds.length) return [];

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const requiredCompanyTypes = await this.types.find({
      where: { category: DocumentCategory.COMPANY, isRequired: 1, isActive: 1 },
    });
    const requiredIds = requiredCompanyTypes.map((t) => t.id);

    const [monthRows, pendingRows, lastRows, companyRows] = await Promise.all([
      this.documents.createQueryBuilder('d')
        .select('d.taxpayer_id', 'taxpayerId').addSelect('COUNT(*)', 'c')
        .where('d.taxpayer_id IN (:...ids)', { ids: taxpayerIds })
        .andWhere('d.status = :st', { st: DocumentStatus.ACTIVE })
        .andWhere('d.created_at >= :since', { since: monthStart })
        .groupBy('d.taxpayer_id')
        .getRawMany<{ taxpayerId: string; c: string }>(),

      this.documents.createQueryBuilder('d')
        .select('d.taxpayer_id', 'taxpayerId').addSelect('COUNT(*)', 'c')
        .where('d.taxpayer_id IN (:...ids)', { ids: taxpayerIds })
        .andWhere('d.status = :st', { st: DocumentStatus.ACTIVE })
        .andWhere('d.is_digitized = 0')
        .groupBy('d.taxpayer_id')
        .getRawMany<{ taxpayerId: string; c: string }>(),

      this.documents.createQueryBuilder('d')
        .select('d.taxpayer_id', 'taxpayerId').addSelect('MAX(d.created_at)', 'last')
        .where('d.taxpayer_id IN (:...ids)', { ids: taxpayerIds })
        .andWhere('d.status = :st', { st: DocumentStatus.ACTIVE })
        .groupBy('d.taxpayer_id')
        .getRawMany<{ taxpayerId: string; last: Date }>(),

      requiredIds.length
        ? this.documents.createQueryBuilder('d')
          .select('d.taxpayer_id', 'taxpayerId')
          .addSelect('COUNT(DISTINCT d.document_type_id)', 'c')
          .where('d.taxpayer_id IN (:...ids)', { ids: taxpayerIds })
          .andWhere('d.status = :st', { st: DocumentStatus.ACTIVE })
          .andWhere('d.document_type_id IN (:...types)', { types: requiredIds })
          .groupBy('d.taxpayer_id')
          .getRawMany<{ taxpayerId: string; c: string }>()
        : Promise.resolve([]),
    ]);

    const profiles = await this.taxpayers.find({ where: { id: In(taxpayerIds) } });
    const profileById = new Map(profiles.map((p) => [String(p.id), p]));
    const asMap = (rows: { taxpayerId: string; c: string }[]) =>
      new Map(rows.map((r) => [String(r.taxpayerId), Number(r.c)]));

    const month = asMap(monthRows);
    const pending = asMap(pendingRows);
    const companyHave = asMap(companyRows);
    const lastByTaxpayer = new Map(lastRows.map((r) => [String(r.taxpayerId), r.last]));

    return auths
      .map((a) => {
        const id = String(a.taxpayerId);
        const profile = profileById.get(id);
        // Mükellef kota paylaşımını kapattıysa sayılar gösterilmez (aynı kural
        // AccessControlService.assertTaxpayerDataVisibleToAccountant'ta da uygulanıyor).
        const quotaVisible = !!profile?.accountantCanViewQuota;
        return {
          taxpayerId: id,
          companyTitle: a.taxpayer?.companyTitle ?? profile?.companyTitle ?? '—',
          vknTckn: a.taxpayer?.vknTckn ?? profile?.vknTckn ?? '—',
          documentsThisMonth: month.get(id) ?? 0,
          pendingDigitize: pending.get(id) ?? 0,
          missingCompanyDocs: Math.max(0, requiredIds.length - (companyHave.get(id) ?? 0)),
          lastUploadAt: lastByTaxpayer.get(id)?.toISOString() ?? null,
          quotaLimit: quotaVisible ? Number(profile?.quotaLimit ?? 0) : 0,
          quotaUsed: quotaVisible ? Number(profile?.quotaUsed ?? 0) : 0,
          quotaVisible,
        };
      })
      // İlgi gerektirenler üstte: önce eksik evrak, sonra bekleyen dijitalleştirme.
      .sort((a, b) => (b.missingCompanyDocs - a.missingCompanyDocs)
        || (b.pendingDigitize - a.pendingDigitize)
        || a.companyTitle.localeCompare(b.companyTitle, 'tr'));
  }
}
