import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { optimizeIfPng } from '../../common/utils/image-optimizer';
import { ALLOWED_DOCUMENT_MIME_TYPES } from '../../common/utils/mime-allowlist';
import { HtmlToPdfService } from '../../infrastructure/render/html-to-pdf.service';
import { Document } from '../../database/entities';
import { DocumentType } from '../../database/entities/document-type.entity';
import { DocumentAuditAction, DocumentCategory, DocumentSource, DocumentStatus } from '../../shared/enums';
import { AuthUser } from '../../common/types/auth-user';
import { Cursor, Paginated } from '../../common/pagination/paginated';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AccessControlService } from '../authorizations/access-control.service';
import { QuotaService } from '../quota/quota.service';
import { DocumentTypesService } from '../document-types/document-types.service';
import { AuditService, AuditLogView } from '../audit/audit.service';
import { validateAndExtractMetadata } from './metadata/metadata.validator';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { QueryDocumentsDto } from './dto/query-documents.dto';
import { VatSummaryQueryDto } from './dto/vat-summary-query.dto';
import { VatPeriodsQueryDto } from './dto/vat-periods-query.dto';
import { QueryDocumentLogsDto } from './dto/query-document-logs.dto';
import { GroupSummaryQueryDto } from './dto/group-summary-query.dto';
import { ReceiptGroupsQueryDto } from './dto/receipt-groups-query.dto';
import { formatDateTr } from '../../shared/format-date';

const DOCUMENT_ENTITY_TYPE = 'document';

export interface CompanyDocumentStatusItem {
  id: number;
  code: string;
  name: string;
  isRequired: boolean;
  uploadedCount: number;
  latestDocumentId: string | null;
  latestTitle: string | null;
  latestUploadedAt: Date | null;
}

export interface VatSummary {
  total: number;
  byType: { documentTypeId: number; typeName: string; count: number; total: number }[];
}

export interface VatNet {
  /** Hesaplanan KDV (satış) — bu ayın kendi toplamı. */
  calculated: number;
  /** İndirilecek KDV (alış) — bu ayın kendi toplamı. */
  deductible: number;
  /** (calculated - deductible - devreden KDV): pozitif ise ödenecek, negatif ise alacak/devreden. */
  net: number;
}

export interface VatPeriodsSummary {
  thisMonth: VatNet;
  lastMonth: VatNet;
  /** Bu ay başına kadar birikmiş indirilecek KDV fazlası (varsa) — devreden KDV. */
  carriedOver: number;
}

export interface GroupSummary {
  count: number;
  totalAmount: number;
  dateFrom: string | null;
  dateTo: string | null;
}

export interface MaliHafizaCommitEntryInput {
  documentNo: string;
  documentDate: string;
  totalAmount: number;
  taxAmount: number;
}

export interface MaliHafizaCommitStripInput {
  label?: string;
  vatRate: '0' | '10' | '20';
  paymentType: 'nakit' | 'kredi_karti' | 'yemek_karti';
  entries: MaliHafizaCommitEntryInput[];
}

export interface MaliHafizaCommitGroupResult {
  groupNo: string;
  count: number;
  totalAmount: number;
}

export interface MaliHafizaCommitResult {
  documentTypeId: number;
  totalDocuments: number;
  groups: MaliHafizaCommitGroupResult[];
}

/** `commitMaliHafiza` kaynak evrağı — zaten GCS'de duran "Mali Hafıza Raporu" taşıyıcı evrağının storage bilgisi. */
export interface MaliHafizaCommitSource {
  storageBucket: string;
  storagePath: string;
  originalName?: string;
  mimeType?: string;
  fileSize?: string;
  checksumSha256?: string;
}

const VAT_RATES = ['0', '10', '20'] as const;
const PAYMENT_TYPES = ['nakit', 'kredi_karti', 'yemek_karti'] as const;
/** `commitMaliHafiza` tek transaction'da bu kadar z_raporu satırı oluşturabilir (~5 yıllık günlük Z). */
const MAX_COMMIT_ENTRIES = 2000;

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export type DocumentWithUrl = Omit<Document, 'uploadedBy' | 'updatedBy' | 'digitizedBy'> & {
  uploadedByName: string | null;
  updatedByName: string | null;
  digitizedByName: string | null;
  /** Uygulamanın kendi (imzasız, parametresiz) dosya ucu — bkz. `streamFile`. */
  fileUrl: string;
};

@Injectable()
export class DocumentsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly storage: StorageService,
    private readonly access: AccessControlService,
    private readonly quota: QuotaService,
    private readonly types: DocumentTypesService,
    private readonly audit: AuditService,
    private readonly htmlToPdf: HtmlToPdfService,
  ) {}

  /**
   * Ortak evrak yükleme. Sıra: erişim → tür/metadata doğrulama → GCS'e yükle →
   * (tx) evrak insert + kota tüket. Tx başarısızsa GCS nesnesi temizlenir.
   */
  async upload(user: AuthUser, dto: UploadDocumentDto, file: UploadedFile): Promise<Document> {
    await this.access.assertTaxpayerAccess(user, dto.taxpayerId);

    file = await this.convertHtmlToPdfIfNeeded(file);

    const type = dto.documentTypeId != null
      ? await this.types.findByIdOrThrow(dto.documentTypeId)
      : await this.types.findUnspecifiedOrThrow();
    this.assertFileAccepted(type, file.mimetype);

    // Evrak Kayıt (hızlı yükleme): yalnızca tür + dosya — alan doğrulaması atlanır,
    // evrak `isDigitized:false` ile kaydedilir. Normal yüklemede tür şemasına göre
    // tüm zorunlu alanlar burada doğrulanır. Hızlı yüklemede yine de gönderilmiş
    // olabilecek kısmi metadata (ör. toplu Z-Raporu yüklemesinde paylaşılan Fiş
    // Grubu No) şema doğrulaması olmadan aynen kaydedilir — eksik zorunlu alanlar
    // dijitalleştirme adımında tamamlanır.
    let metadata: Record<string, unknown> = {};
    let documentDate: string | undefined;
    if (!dto.quick) {
      const rawMeta = dto.metadata ? (JSON.parse(dto.metadata) as Record<string, unknown>) : {};
      ({ metadata, documentDate } = validateAndExtractMetadata(type.metadataSchema, rawMeta));
      this.applyDerivedMetadata(type, metadata);
    } else if (dto.metadata) {
      metadata = JSON.parse(dto.metadata) as Record<string, unknown>;
    }
    if (!dto.quick && !dto.title) throw new BadRequestException('Başlık zorunludur.');
    const title = dto.title || stripExtension(file.originalname) || type.name;

    // PNG'ler kayıpsız yeniden sıkıştırılır (yalnızca deflate/filtre iyileştirmesi — piksel
    // verisi değişmez); depolanan/checksum'lanan buffer bu yüzden dosyanın kendisinden alınır.
    const buffer = await optimizeIfPng(file.buffer, file.mimetype);
    const checksum = createHash('sha256').update(buffer).digest('hex');
    await this.assertNotDuplicateFile(dto.taxpayerId, checksum);

    const safeName = file.originalname.replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `taxpayers/${dto.taxpayerId}/${type.code}/${randomUUID()}-${safeName}`;

    // Kota ön kontrolü depolamaya YAZMADAN önce: nihai karar aşağıdaki tx içinde
    // (kilit altında) veriliyor ama önce yükleyip sonra reddetmek her denemede
    // sahipsiz bir nesne bırakıyordu.
    const consumesQuota = type.category !== DocumentCategory.COMPANY;
    if (consumesQuota) await this.quota.assertAvailable(dto.taxpayerId, 1);

    const uploaded = await this.storage.upload(path, buffer, file.mimetype);

    try {
      const saved = await this.dataSource.transaction(async (tx) => {
        // Kota tüketilecekse mükellef satırı INSERT'ten ÖNCE X kilidine alınır; aksi
        // hâlde FK'nin aldığı S kilidi ile aşağıdaki `consume`un istediği X kilidi
        // eşzamanlı yüklemelerde deadlock üretiyor (bkz. lockTaxpayerForUpdate).
        if (consumesQuota) await this.quota.lockTaxpayerForUpdate(dto.taxpayerId, tx);
        const doc = tx.create(Document, {
          taxpayerId: dto.taxpayerId,
          documentTypeId: type.id,
          uploadedByUserId: user.userId,
          updatedByUserId: user.userId,
          isDigitized: !dto.quick,
          title,
          description: dto.description,
          documentDate,
          storageBucket: uploaded.bucket,
          storagePath: uploaded.path,
          originalName: file.originalname,
          mimeType: file.mimetype,
          fileSize: String(buffer.length),
          checksumSha256: checksum,
          metadata,
          status: DocumentStatus.ACTIVE,
          source: dto.source ?? DocumentSource.UNKNOWN,
        });
        const row = await tx.save(doc);
        // Kota, şirket (company) evrakları hariç tüketilir — hızlı erişim dokümanları kotayı yemez.
        // Evrak Kayıt (hızlı yükleme) de normal yükleme gibi anında tüketir; dijitalleştirme
        // adımı ayrıca tüketmez (bkz. `digitize`).
        if (consumesQuota) {
          await this.quota.consume(dto.taxpayerId, 1, row.id, tx);
        }
        return row;
      });
      await this.audit.log({
        actorUserId: user.userId,
        action: DocumentAuditAction.UPLOADED,
        entityType: DOCUMENT_ENTITY_TYPE,
        entityId: saved.id,
        taxpayerId: saved.taxpayerId,
        metadata: { documentTitle: saved.title, documentTypeId: saved.documentTypeId },
      });
      return saved;
    } catch (err) {
      await this.storage.delete(path).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Evrak Dijitalleştir — kuyruktaki (isDigitized:false) bir evrağın alanlarını doldurup
   * tam evrağa dönüştürür. Kota TEKRAR tüketilmez (Evrak Kayıt anında zaten tüketildi).
   */
  async digitize(user: AuthUser, id: string, dto: UpdateDocumentDto): Promise<Document> {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc || doc.status === DocumentStatus.DELETED) throw new NotFoundException('Evrak bulunamadı.');
    await this.access.assertTaxpayerAccess(user, doc.taxpayerId);
    if (doc.isDigitized) throw new BadRequestException('Bu evrak zaten dijitalleştirilmiş.');
    if (!dto.metadata) throw new BadRequestException('Evrak bilgileri zorunludur.');

    const type = await this.types.findByIdOrThrow(doc.documentTypeId);
    const rawMeta = JSON.parse(dto.metadata) as Record<string, unknown>;
    const { metadata, documentDate } = validateAndExtractMetadata(type.metadataSchema, rawMeta);
    this.applyDerivedMetadata(type, metadata);

    const patch: Partial<Document> = {
      title: dto.title || doc.title,
      description: dto.description,
      metadata,
      documentDate,
      isDigitized: true,
      digitizedByUserId: user.userId,
      digitizedAt: new Date(),
      updatedByUserId: user.userId,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.documents.update({ id }, patch as any);
    await this.audit.log({
      actorUserId: user.userId,
      action: DocumentAuditAction.DIGITIZED,
      entityType: DOCUMENT_ENTITY_TYPE,
      entityId: id,
      taxpayerId: doc.taxpayerId,
      metadata: { documentTitle: patch.title, documentTypeId: doc.documentTypeId },
    });
    return (await this.documents.findOne({ where: { id }, relations: { documentType: true } }))!;
  }

  /**
   * Mali Hafıza Raporu içe aktarma — Evrak Kayıt'tan yüklenip Evrak Dijitalleştir'de analiz
   * edilmiş TEK bir "Mali Hafıza Raporu" kaynak evrağından (yan yana birden fazla ayrı
   * şerit/cihaz olabilir) çıkarılmış N günü kalıcı z_raporu kayıtlarına dönüştürür. Kaynak
   * fotoğraf zaten GCS'de duruyor (bkz. `source`) — TEKRAR yüklenmez, oluşturulan her
   * z_raporu satırı aynı storage nesnesine işaret eder (görüntüle/indir hepsinde aynı
   * fotoğrafı açar). Her şerit TAZE bir `receiptGroupNo` alır — var olan hiçbir gruba
   * birleşmez (aynı ay içinde iki farklı cihaz şeridi aynı gruba karışmasın diye).
   */
  async commitMaliHafiza(
    user: AuthUser,
    taxpayerId: string,
    stripsInput: MaliHafizaCommitStripInput[],
    source: MaliHafizaCommitSource,
  ): Promise<MaliHafizaCommitResult> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);

    const strips = (stripsInput ?? []).filter((s) => s.entries?.length);
    if (!strips.length) throw new BadRequestException('Kaydedilecek gün bulunamadı.');
    // Tüm şeritler tek transaction'da işleniyor — şerit başına sınır (bkz. CommitMaliHafizaStripDto)
    // tek başına yeterli değil, toplam satır sayısı da bağlanmalı.
    const totalEntries = strips.reduce((sum, s) => sum + s.entries.length, 0);
    if (totalEntries > MAX_COMMIT_ENTRIES) {
      throw new BadRequestException(`Tek seferde en fazla ${MAX_COMMIT_ENTRIES} günlük satır kaydedilebilir.`);
    }
    for (const strip of strips) {
      if (!VAT_RATES.includes(strip.vatRate)) throw new BadRequestException('Geçersiz KDV oranı.');
      if (!PAYMENT_TYPES.includes(strip.paymentType)) throw new BadRequestException('Geçersiz ödeme türü.');
      for (const entry of strip.entries) {
        if (!entry.documentNo || !/^\d{4}-\d{2}-\d{2}$/.test(entry.documentDate) || !(Number(entry.totalAmount) >= 0)) {
          throw new BadRequestException('Şerit satırlarında eksik/geçersiz alan var.');
        }
      }
    }

    const type = await this.types.findByCodeOrThrow('z_raporu');

    const groups: MaliHafizaCommitGroupResult[] = [];
    const createdDocs: { id: string; title: string }[] = [];

    await this.dataSource.transaction(async (tx) => {
      // Döngüdeki her evrak için `consume` çağrılıyor; mükellef satırı en baştan bir kez
      // X kilidine alınmazsa ilk INSERT'in FK üzerinden aldığı S kilidi ile çakışıp
      // eşzamanlı commit'lerde deadlock üretir (bkz. lockTaxpayerForUpdate).
      await this.quota.lockTaxpayerForUpdate(taxpayerId, tx);
      for (const strip of strips) {
        const groupNo = generateMaliHafizaGroupNo(strip.entries[0].documentDate);
        let groupCount = 0;
        let groupTotal = 0;

        for (const entry of strip.entries) {
          const rawMeta: Record<string, unknown> = {
            documentNo: entry.documentNo,
            documentDate: entry.documentDate,
            receiptGroupNo: groupNo,
            totalAmount: entry.totalAmount,
          };
          if (strip.vatRate === '0') {
            rawMeta.vat0SalesAmount = entry.totalAmount;
          } else {
            const taxAmount = Math.max(0, Number(entry.taxAmount) || 0);
            rawMeta[`vat${strip.vatRate}SalesAmount`] = Math.round((entry.totalAmount - taxAmount) * 100) / 100;
            rawMeta[`vat${strip.vatRate}TaxAmount`] = taxAmount;
          }
          if (strip.paymentType === 'nakit') rawMeta.cashAmount = entry.totalAmount;
          else if (strip.paymentType === 'kredi_karti') rawMeta.creditCardAmount = entry.totalAmount;
          else rawMeta.mealCardAmount = entry.totalAmount;

          const { metadata, documentDate } = validateAndExtractMetadata(type.metadataSchema, rawMeta);
          this.applyDerivedMetadata(type, metadata);

          const title = `${type.name} ${entry.documentNo}`;
          const doc = tx.create(Document, {
            taxpayerId,
            documentTypeId: type.id,
            uploadedByUserId: user.userId,
            updatedByUserId: user.userId,
            digitizedByUserId: user.userId,
            digitizedAt: new Date(),
            isDigitized: true,
            title,
            documentDate,
            storageBucket: source.storageBucket,
            storagePath: source.storagePath,
            originalName: source.originalName,
            mimeType: source.mimeType,
            fileSize: source.fileSize,
            checksumSha256: source.checksumSha256,
            metadata,
            status: DocumentStatus.ACTIVE,
            // Not: buradaki `source` yerel değişkeni taşıyıcı evrağın GCS bilgisidir;
            // aşağıdaki alan ise evrağın hangi akıştan doğduğunu söyleyen etiket.
            source: DocumentSource.MALI_HAFIZA,
          });
          const row = await tx.save(doc);
          await this.quota.consume(taxpayerId, 1, row.id, tx);
          createdDocs.push({ id: row.id, title });
          groupCount += 1;
          groupTotal = Math.round((groupTotal + entry.totalAmount) * 100) / 100;
        }

        groups.push({ groupNo, count: groupCount, totalAmount: groupTotal });
      }
    });

    for (const d of createdDocs) {
      await this.audit.log({
        actorUserId: user.userId,
        action: DocumentAuditAction.UPLOADED,
        entityType: DOCUMENT_ENTITY_TYPE,
        entityId: d.id,
        taxpayerId,
        metadata: { documentTitle: d.title, documentTypeId: type.id },
      });
    }

    return { documentTypeId: type.id, totalDocuments: createdDocs.length, groups };
  }

  /**
   * `commitMaliHafiza` başarıyla N adet z_raporu kaydı oluşturduktan sonra, Evrak Kayıt'tan
   * yüklenmiş taşıyıcı "Mali Hafıza Raporu" kaynak evrağını tamamlanmış işaretler — asıl veri
   * artık z_raporu kayıtlarında olduğundan burada yalnızca özet bir başlık/metadata yeterli.
   */
  async finalizeMaliHafizaSource(user: AuthUser, id: string, taxpayerId: string, result: MaliHafizaCommitResult): Promise<void> {
    const title = `Mali Hafıza Raporu (${result.totalDocuments} gün, ${result.groups.length} fiş grubu)`;
    const patch: Partial<Document> = {
      isDigitized: true,
      digitizedByUserId: user.userId,
      digitizedAt: new Date(),
      updatedByUserId: user.userId,
      title,
      metadata: { totalDocuments: result.totalDocuments, groups: result.groups },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.documents.update({ id }, patch as any);
    await this.audit.log({
      actorUserId: user.userId,
      action: DocumentAuditAction.DIGITIZED,
      entityType: DOCUMENT_ENTITY_TYPE,
      entityId: id,
      taxpayerId,
      metadata: { documentTitle: title },
    });
  }

  /**
   * Var olan bir evrağı düzenler (başlık/açıklama/meta veri). Dosya değişmez.
   * `metadata` verilmişse türün şemasına göre yeniden doğrulanır (wholesale replace).
   */
  async update(user: AuthUser, id: string, dto: UpdateDocumentDto): Promise<Document> {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc || doc.status === DocumentStatus.DELETED) throw new NotFoundException('Evrak bulunamadı.');
    await this.access.assertTaxpayerAccess(user, doc.taxpayerId);

    const patch: Partial<Document> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.description !== undefined) patch.description = dto.description;

    if (dto.metadata !== undefined) {
      const type = await this.types.findByIdOrThrow(doc.documentTypeId);
      const rawMeta = JSON.parse(dto.metadata) as Record<string, unknown>;
      const { metadata, documentDate } = validateAndExtractMetadata(type.metadataSchema, rawMeta);
      this.applyDerivedMetadata(type, metadata);
      patch.metadata = metadata;
      if (documentDate) patch.documentDate = documentDate;
    }

    if (Object.keys(patch).length) {
      patch.updatedByUserId = user.userId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.documents.update({ id }, patch as any);
      await this.audit.log({
        actorUserId: user.userId,
        action: DocumentAuditAction.UPDATED,
        entityType: DOCUMENT_ENTITY_TYPE,
        entityId: id,
        taxpayerId: doc.taxpayerId,
        metadata: { documentTitle: patch.title ?? doc.title, changedFields: Object.keys(patch).filter((k) => k !== 'updatedByUserId') },
      });
    }
    return (await this.documents.findOne({ where: { id }, relations: { documentType: true } }))!;
  }

  /**
   * Evrak Kayıt kuyruğundaki (henüz dijitalleştirilmemiş) bir evrağın grup alanını
   * (ör. Z-Raporu'nda Fiş Grubu No) ayarlar/değiştirir. `update()`'in aksine şemaya
   * göre tüm zorunlu alanları doğrulamaz — henüz doldurulmamış olabilirler; yalnızca
   * grup alanını var olan metadata üzerine birleştirir.
   */
  async updateReceiptGroup(user: AuthUser, id: string, groupNo: string): Promise<Document> {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc || doc.status === DocumentStatus.DELETED) throw new NotFoundException('Evrak bulunamadı.');
    await this.access.assertTaxpayerAccess(user, doc.taxpayerId);
    if (doc.isDigitized) throw new BadRequestException('Dijitalleştirilmiş evrağın grubu bu yoldan değiştirilemez — evrağı düzenleyin.');

    const type = await this.types.findByIdOrThrow(doc.documentTypeId);
    const groupField = type.metadataSchema?.groupField;
    if (!groupField) throw new BadRequestException('Bu evrak türünde gruplama desteklenmiyor.');

    const metadata = { ...doc.metadata, [groupField]: groupNo };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.documents.update({ id }, { metadata, updatedByUserId: user.userId } as any);
    await this.audit.log({
      actorUserId: user.userId,
      action: DocumentAuditAction.UPDATED,
      entityType: DOCUMENT_ENTITY_TYPE,
      entityId: id,
      taxpayerId: doc.taxpayerId,
      metadata: { documentTitle: doc.title, changedFields: [`metadata.${groupField}`] },
    });
    return (await this.documents.findOne({ where: { id }, relations: { documentType: true } }))!;
  }

  /** Grup satırı için doğru adet/toplam — sayfa-içi kaba sayım yerine kullanılır. */
  async groupSummary(user: AuthUser, query: GroupSummaryQueryDto): Promise<GroupSummary> {
    const scope = await this.access.accessibleTaxpayerIds(user);
    if (scope !== 'ALL' && scope.length === 0) return { count: 0, totalAmount: 0, dateFrom: null, dateTo: null };

    const qb = this.documents
      .createQueryBuilder('d')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(d.meta_amount), 0)', 'totalAmount')
      .addSelect('MIN(d.document_date)', 'dateFrom')
      .addSelect('MAX(d.document_date)', 'dateTo')
      .where('d.status = :status', { status: DocumentStatus.ACTIVE })
      .andWhere('d.document_type_id = :t', { t: query.documentTypeId })
      .andWhere('d.meta_receipt_group_no = :gn', { gn: query.groupNo });

    if (query.taxpayerId) {
      await this.access.assertTaxpayerAccess(user, query.taxpayerId);
      qb.andWhere('d.taxpayer_id = :tp', { tp: query.taxpayerId });
    } else if (scope !== 'ALL') {
      qb.andWhere('d.taxpayer_id IN (:...ids)', { ids: scope });
    }

    const row = await qb.getRawOne<{
      count: string;
      totalAmount: string;
      dateFrom: string | null;
      dateTo: string | null;
    }>();
    if (!row) return { count: 0, totalAmount: 0, dateFrom: null, dateTo: null };

    return {
      count: Number(row.count),
      totalAmount: Number(row.totalAmount),
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
    };
  }

  /** Bir Fiş Grubu'ndaki (ör. Mali Hafıza Raporu içe aktarımından gelen 30+ günlük Z-Raporu)
   *  tüm evrakları tek seferde çöp kutusuna taşır — kullanıcı tek tek silmek zorunda kalmasın. */
  async deleteGroup(user: AuthUser, documentTypeId: number, groupNo: string, taxpayerId?: string): Promise<{ count: number }> {
    const docs = await this.findGroupMembers(user, documentTypeId, groupNo, taxpayerId);
    if (!docs.length) throw new NotFoundException('Fiş grubu bulunamadı.');

    await this.documents.update(
      { id: In(docs.map((d) => d.id)) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { status: DocumentStatus.DELETED, deletedAt: new Date() } as any,
    );
    for (const d of docs) {
      await this.audit.log({
        actorUserId: user.userId,
        action: DocumentAuditAction.DELETED,
        entityType: DOCUMENT_ENTITY_TYPE,
        entityId: d.id,
        taxpayerId: d.taxpayerId,
        metadata: { documentTitle: d.title, documentTypeId, note: `Fiş Grubu (${groupNo}) toplu silme` },
      });
    }
    return { count: docs.length };
  }

  /** Bir Fiş Grubu'ndaki tüm evrakların Fiş Grup No'sunu tek seferde değiştirir — ör. otomatik
   *  üretilmiş bir grup no'yu daha anlamlı bir isimle değiştirmek ya da iki grubu birleştirmek için. */
  async renameGroup(user: AuthUser, documentTypeId: number, groupNo: string, newGroupNo: string, taxpayerId?: string): Promise<{ count: number }> {
    const trimmed = newGroupNo.trim();
    if (!trimmed) throw new BadRequestException('Yeni Fiş Grubu No zorunlu.');
    const docs = await this.findGroupMembers(user, documentTypeId, groupNo, taxpayerId);
    if (!docs.length) throw new NotFoundException('Fiş grubu bulunamadı.');

    await this.dataSource.transaction(async (tx) => {
      // Satırlar id sırasına göre güncellenir: `findGroupMembers` sıralama garantisi
      // vermiyor, tek tek UPDATE eden iki eşzamanlı yeniden adlandırma kesişen kümeye
      // ters sırada girerse satır kilitlerinde deadlock olurdu. Sabit sıra bunu keser.
      for (const d of [...docs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
        const metadata = { ...d.metadata, receiptGroupNo: trimmed };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.update(Document, { id: d.id }, { metadata, updatedByUserId: user.userId } as any);
      }
    });
    await this.audit.log({
      actorUserId: user.userId,
      action: DocumentAuditAction.UPDATED,
      entityType: DOCUMENT_ENTITY_TYPE,
      entityId: docs[0].id,
      taxpayerId: docs[0].taxpayerId,
      metadata: { documentTitle: `Fiş Grubu ${groupNo} → ${trimmed}`, documentTypeId, changedFields: ['metadata.receiptGroupNo'] },
    });
    return { count: docs.length };
  }

  /** `deleteGroup`/`renameGroup` ortak: erişim kapsamındaki, bir Fiş Grubu'nun aktif üyeleri. */
  private async findGroupMembers(user: AuthUser, documentTypeId: number, groupNo: string, taxpayerId?: string): Promise<Document[]> {
    const scope = await this.access.accessibleTaxpayerIds(user);
    if (scope !== 'ALL' && scope.length === 0) return [];

    const qb = this.documents
      .createQueryBuilder('d')
      .where('d.status = :status', { status: DocumentStatus.ACTIVE })
      .andWhere('d.document_type_id = :t', { t: documentTypeId })
      .andWhere('d.meta_receipt_group_no = :gn', { gn: groupNo });

    if (taxpayerId) {
      await this.access.assertTaxpayerAccess(user, taxpayerId);
      qb.andWhere('d.taxpayer_id = :tp', { tp: taxpayerId });
    } else if (scope !== 'ALL') {
      qb.andWhere('d.taxpayer_id IN (:...ids)', { ids: scope });
    }

    return qb.getMany();
  }

  /**
   * Z-Raporu dijitalleştirmede "Fiş Grubu" alanı için mevcut grup no'ları — kullanıcı
   * elle yazmak yerine daha önce kullanılmış bir gruptan seçebilsin diye. En son
   * kullanılan grup başta olacak şekilde sıralanır.
   */
  async receiptGroups(user: AuthUser, query: ReceiptGroupsQueryDto): Promise<string[]> {
    const scope = await this.access.accessibleTaxpayerIds(user);
    if (scope !== 'ALL' && scope.length === 0) return [];

    const qb = this.documents
      .createQueryBuilder('d')
      .select('d.meta_receipt_group_no', 'groupNo')
      .addSelect('MAX(d.id)', 'lastId')
      .where('d.status = :status', { status: DocumentStatus.ACTIVE })
      .andWhere('d.document_type_id = :t', { t: query.documentTypeId })
      .andWhere('d.meta_receipt_group_no IS NOT NULL')
      .groupBy('d.meta_receipt_group_no')
      .orderBy('lastId', 'DESC')
      .limit(50);

    if (query.taxpayerId) {
      await this.access.assertTaxpayerAccess(user, query.taxpayerId);
      qb.andWhere('d.taxpayer_id = :tp', { tp: query.taxpayerId });
    } else if (scope !== 'ALL') {
      qb.andWhere('d.taxpayer_id IN (:...ids)', { ids: scope });
    }

    const rows = await qb.getRawMany<{ groupNo: string }>();
    return rows.map((r) => r.groupNo);
  }

  /**
   * "Şirket Evraklarım" kart görünümü için: her aktif şirket evrak türünün bu
   * mükellefte yüklü olup olmadığı + en güncel kaydı. Zorunlu türler (`isRequired`)
   * eksikse kart eksik/uyarı durumunda gösterilir.
   */
  async getCompanyDocumentStatus(user: AuthUser, taxpayerId: string): Promise<CompanyDocumentStatusItem[]> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);
    const types = await this.types.findAll(DocumentCategory.COMPANY);
    if (types.length === 0) return [];

    const rows = await this.documents
      .createQueryBuilder('d')
      .select('d.document_type_id', 'documentTypeId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('MAX(d.id)', 'latestId')
      .where('d.status = :status', { status: DocumentStatus.ACTIVE })
      .andWhere('d.taxpayer_id = :tp', { tp: taxpayerId })
      .andWhere('d.document_type_id IN (:...ids)', { ids: types.map((t) => t.id) })
      .groupBy('d.document_type_id')
      .getRawMany<{ documentTypeId: number; count: string; latestId: string }>();

    const latestIds = rows.map((r) => r.latestId);
    const latestDocs = latestIds.length
      ? await this.documents.find({ where: latestIds.map((id) => ({ id })) })
      : [];
    const latestByType = new Map(latestDocs.map((d) => [d.documentTypeId, d]));
    const countByType = new Map(rows.map((r) => [r.documentTypeId, Number(r.count)]));

    return types.map((t) => {
      const latest = latestByType.get(t.id);
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        isRequired: !!t.isRequired,
        uploadedCount: countByType.get(t.id) ?? 0,
        latestDocumentId: latest?.id ?? null,
        latestTitle: latest?.title ?? null,
        latestUploadedAt: latest?.createdAt ?? null,
      };
    });
  }

  /**
   * HTML yüklenirse (ör. Luca içe aktarımındaki e-Fatura/e-Arşiv render'ları) saklanmadan
   * önce headless Chromium ile PDF'e dönüştürülür — HTML hâlbuki `ALLOWED_DOCUMENT_MIME_TYPES`'ta
   * asla yok (stored XSS vektörü), bu yüzden akışın geri kalanı bu adımdan sonra hep PDF görür.
   */
  private async convertHtmlToPdfIfNeeded(file: UploadedFile): Promise<UploadedFile> {
    const isHtml = file.mimetype === 'text/html' || /\.html?$/i.test(file.originalname);
    if (!isHtml) return file;

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.htmlToPdf.convert(file.buffer);
    } catch {
      throw new BadRequestException("HTML dosyası PDF'e dönüştürülemedi.");
    }
    return {
      ...file,
      buffer: pdfBuffer,
      mimetype: 'application/pdf',
      size: pdfBuffer.length,
      originalname: file.originalname.replace(/\.html?$/i, '') + '.pdf',
    };
  }

  /** Dosya türü kısıtı: global allowlist (SVG/HTML gibi yorumlanabilir tipleri dışlar) + tür bazlı `fileAccept`. */
  private assertFileAccepted(type: DocumentType, mimetype: string): void {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(mimetype)) {
      throw new BadRequestException('Desteklenmeyen dosya türü. Yalnızca PDF, JPG, PNG, WEBP veya HEIC yüklenebilir.');
    }
    if (type.metadataSchema?.fileAccept === 'image/*' && !mimetype.startsWith('image/')) {
      throw new BadRequestException('Bu evrak türü için yalnızca görsel dosyası (jpg, png vb.) yüklenebilir.');
    }
  }

  /**
   * Birebir aynı dosyanın (SHA-256 checksum) aynı mükellef için tekrar yüklenmesini
   * engeller — GCS'e yazmadan/kota tüketmeden ÖNCE, kesin (false-positive riski olmayan)
   * tekrar kontrolü. İçerik-bazlı (Fatura No/VKN/Tutar) olası tekrarlar burada değil,
   * `DuplicateScanService` tarafından periyodik olarak taranıp bildirim üretilir.
   */
  private async assertNotDuplicateFile(taxpayerId: string, checksum: string): Promise<void> {
    const existing = await this.documents.findOne({
      where: { taxpayerId, checksumSha256: checksum, status: DocumentStatus.ACTIVE },
    });
    if (existing) {
      throw new ConflictException(
        `Bu dosya daha önce "${existing.title}" adıyla yüklenmiş (${formatDateTr(existing.createdAt)}). Aynı dosya tekrar yüklenemez.`,
      );
    }
  }

  /**
   * Z-Raporu: ayrı bir "toplam KDV" alanı formda yok ama KDV Hesaplama
   * (`vatSummary`) kanonik `taxAmount` → `meta_tax_amount` kolonuna dayanıyor.
   * %10 ve %20 KDV tutarlarının toplamını otomatik `taxAmount` olarak yazarak
   * Z-Raporu kayıtlarının KDV Hesaplama'ya doğru şekilde dahil olmasını sağlar.
   *
   * Z-Raporu'nun forma alış/satış seçimi yok — perakende satış fişi özeti olduğundan
   * yönü her zaman satıştır. `direction` şemada tanımlı bir alan olmasa da `metadata`ya
   * yazılması, generated `meta_direction` kolonuna işler; böylece hem listede "Satış"
   * görünür hem KDV Hesaplama netleştirmesinde satış tarafına dahil olur.
   */
  private applyDerivedMetadata(type: DocumentType, metadata: Record<string, unknown>): void {
    if (type.code !== 'z_raporu') return;
    metadata.direction = 'satis';
    const v10 = Number(metadata.vat10TaxAmount ?? 0);
    const v20 = Number(metadata.vat20TaxAmount ?? 0);
    if (v10 || v20) metadata.taxAmount = Math.round((v10 + v20) * 100) / 100;
  }

  /**
   * Türe özel / genel listeleme. Keyset (cursor) pagination — id DESC üzerinden,
   * PK monotonik olduğundan derin sayfalarda offset maliyeti yok. Sıcak filtreler
   * indeksli generated meta_* kolonlarına düşer.
   */
  async list(user: AuthUser, query: QueryDocumentsDto): Promise<Paginated<Document>> {
    // Evrak sorgu / şirket evrakları: dijitalleştirilmemiş evraklar varsayılan olarak
    // gizli kalır — yalnızca Dijitalleştir kuyruğu `isDigitized=false` göndererek görür.
    // `includeUndigitized` verilirse filtre hiç uygulanmaz ve ikisi birlikte döner
    // (mobil uygulamanın Evraklar sayfası; taranan evrak anında listede görünsün diye).
    const effectiveQuery: QueryDocumentsDto = {
      ...query,
      isDigitized: query.isDigitized ?? (query.includeUndigitized ? undefined : true),
    };
    const qb = await this.baseScopedQuery(user, effectiveQuery, DocumentStatus.ACTIVE);
    if (!qb) return { items: [], nextCursor: null, limit: query.limit };

    if (query.page) {
      const total = await qb.clone().getCount();
      const items = await qb.orderBy('d.id', 'DESC').skip((query.page - 1) * query.limit).take(query.limit).getMany();
      return { items, nextCursor: null, limit: query.limit, total, page: query.page, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
    }

    if (query.cursor) {
      qb.andWhere('d.id < :cid', { cid: Cursor.decode(query.cursor) });
    }

    qb.orderBy('d.id', 'DESC').take(query.limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? Cursor.encode(items[items.length - 1].id) : null;

    return { items, nextCursor, limit: query.limit };
  }

  /** Çöp kutusu — silinmiş evraklar (tüm kategoriler), en son silinen önce. */
  async listTrash(user: AuthUser, query: QueryDocumentsDto): Promise<Paginated<Document>> {
    const qb = await this.baseScopedQuery(user, query, DocumentStatus.DELETED);
    if (!qb) return { items: [], nextCursor: null, limit: query.limit };

    if (query.page) {
      const total = await qb.clone().getCount();
      const items = await qb.orderBy('d.deleted_at', 'DESC').addOrderBy('d.id', 'DESC')
        .skip((query.page - 1) * query.limit).take(query.limit).getMany();
      return { items, nextCursor: null, limit: query.limit, total, page: query.page, totalPages: Math.max(1, Math.ceil(total / query.limit)) };
    }

    if (query.cursor) {
      qb.andWhere('d.id < :cid', { cid: Cursor.decode(query.cursor) });
    }

    qb.orderBy('d.deleted_at', 'DESC').addOrderBy('d.id', 'DESC').take(query.limit + 1);

    const rows = await qb.getMany();
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? Cursor.encode(items[items.length - 1].id) : null;

    return { items, nextCursor, limit: query.limit };
  }

  /** `list`/`listTrash` ortak filtre iskeleti; erişim kapsamı boşsa null döner. */
  private async baseScopedQuery(
    user: AuthUser,
    query: QueryDocumentsDto,
    status: DocumentStatus,
  ) {
    const scope = await this.access.accessibleTaxpayerIds(user);
    if (scope !== 'ALL' && scope.length === 0) return null;

    // withDeleted: entity `@DeleteDateColumn` (deletedAt) olduğu için TypeORM varsayılan olarak
    // her sorguya `deleted_at IS NULL` ekler — çöp kutusu (status=deleted) satırlarını görmek için kapatılır.
    const qb = this.documents.createQueryBuilder('d').withDeleted().where('d.status = :status', { status });

    if (query.taxpayerId) {
      await this.access.assertTaxpayerAccess(user, query.taxpayerId);
      qb.andWhere('d.taxpayer_id = :tp', { tp: query.taxpayerId });
    } else if (scope !== 'ALL') {
      qb.andWhere('d.taxpayer_id IN (:...ids)', { ids: scope });
    }

    if (query.documentTypeId) qb.andWhere('d.document_type_id = :t', { t: query.documentTypeId });
    if (query.category) {
      qb.innerJoin('d.documentType', 'dt').andWhere('dt.category = :cat', { cat: query.category });
    }
    if (query.dateFrom) qb.andWhere('d.document_date >= :df', { df: query.dateFrom });
    if (query.dateTo) qb.andWhere('d.document_date <= :dt', { dt: query.dateTo });
    if (query.amountMin != null) qb.andWhere('d.meta_amount >= :amin', { amin: query.amountMin });
    if (query.amountMax != null) qb.andWhere('d.meta_amount <= :amax', { amax: query.amountMax });
    if (query.taxId) qb.andWhere('d.meta_tax_id = :tax', { tax: query.taxId });
    if (query.docNo) qb.andWhere('d.meta_doc_no LIKE :dn', { dn: `${query.docNo}%` });
    if (query.direction) qb.andWhere('d.meta_direction = :dir', { dir: query.direction });
    if (query.groupNo) qb.andWhere('d.meta_receipt_group_no = :gn', { gn: query.groupNo });
    if (query.q) qb.andWhere('d.title LIKE :q', { q: `%${query.q}%` });
    if (query.isDigitized != null) qb.andWhere('d.is_digitized = :dig', { dig: query.isDigitized ? 1 : 0 });

    // Sayfalama HAM satır değil "görüntü birimi" üzerinden yapılmalı: bir Fiş Grubu'nun
    // (ör. Mali Hafıza Raporu içe aktarımından gelen 30+ günlük Z-Raporu) tüm üyeleri aynı
    // sayfaya düşmeyebilir — bu da bir grubu sayfa sınırında ikiye bölüp diğer grupların ilk
    // sayfadan tamamen kaybolmasına yol açıyordu. `query.groupNo` verilmemişse (yani bir grubun
    // içine değil genel listeye bakıyorsak) her (tür, fiş grubu no) çiftini TEK satıra
    // (en yeni id'li üyesi) indirger; tek üyeli "gruplar" böylece kendi id'sini temsilci
    // seçtiği için zaten olduğu gibi kalır. Gerçek üye sayısı/toplamı `groupSummary()`den gelir.
    if (!query.groupNo) {
      const repIds = qb
        .clone()
        .select('MAX(d.id)', 'repId')
        .andWhere('d.meta_receipt_group_no IS NOT NULL')
        .groupBy('d.document_type_id')
        .addGroupBy('d.meta_receipt_group_no');

      qb.andWhere(
        new Brackets((sub) => {
          sub.where('d.meta_receipt_group_no IS NULL').orWhere(`d.id IN (${repIds.getQuery()})`);
        }),
      ).setParameters(repIds.getParameters());
    }

    return qb;
  }

  async getWithUrl(user: AuthUser, id: string): Promise<DocumentWithUrl> {
    const doc = await this.documents.findOne({
      where: { id },
      relations: { documentType: true, uploadedBy: true, updatedBy: true, digitizedBy: true },
    });
    if (!doc || doc.status === DocumentStatus.DELETED) throw new NotFoundException('Evrak bulunamadı.');
    await this.access.assertTaxpayerAccess(user, doc.taxpayerId);
    // İlişkili User nesnelerini olduğu gibi döndürmek yerine sadece görünen ad/e-postayı
    // çıkarıyoruz — gereksiz kullanıcı alanlarının (bio, uiPreferences vb.) sızmasını önler.
    const { uploadedBy, updatedBy, digitizedBy, ...rest } = doc;
    return {
      ...rest,
      uploadedByName: uploadedBy?.fullName || uploadedBy?.email || null,
      updatedByName: updatedBy?.fullName || updatedBy?.email || null,
      digitizedByName: digitizedBy?.fullName || digitizedBy?.email || null,
      // İmzasız/parametresiz — depolama sağlayıcısı, bucket, imza asla istemciye görünmez.
      // Frontend bunu authenticated blob fetch ile açar (bkz. GET /documents/:id/file).
      fileUrl: `/documents/${doc.id}/file`,
    };
  }

  /**
   * Önizleme/indirme için dosyayı backend üzerinden akış olarak açar. İmzalı URL/parametre
   * ASLA istemciye sızmaz — GCS bucket/path/imza tamamen sunucu tarafında kalır.
   */
  async streamFile(user: AuthUser, id: string): Promise<{ stream: NodeJS.ReadableStream; mimeType: string; filename: string }> {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc || doc.status === DocumentStatus.DELETED) throw new NotFoundException('Evrak bulunamadı.');
    await this.access.assertTaxpayerAccess(user, doc.taxpayerId);
    const stream = await this.storage.getObjectStream(doc.storagePath);
    return { stream, mimeType: doc.mimeType || 'application/octet-stream', filename: doc.originalName || doc.title };
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc || doc.status === DocumentStatus.DELETED) throw new NotFoundException('Evrak bulunamadı.');
    await this.access.assertTaxpayerAccess(user, doc.taxpayerId);

    // Depolama nesnesi burada SİLİNMEZ — çöp kutusundaki evrak `restore()` ile geri
    // getirilebilmeli. Gerçek silme yalnızca `purge()`da (kalıcı silme) yapılır.
    await this.documents.update({ id }, { status: DocumentStatus.DELETED, deletedAt: new Date() });
    await this.audit.log({
      actorUserId: user.userId,
      action: DocumentAuditAction.DELETED,
      entityType: DOCUMENT_ENTITY_TYPE,
      entityId: id,
      taxpayerId: doc.taxpayerId,
      metadata: { documentTitle: doc.title, documentTypeId: doc.documentTypeId },
    });
  }

  /** Çöp kutusundan geri yükleme. Kota tekrar tüketilmez (silme sırasında da iade edilmiyor). */
  async restore(user: AuthUser, id: string): Promise<void> {
    const doc = await this.documents.findOne({ where: { id }, withDeleted: true });
    if (!doc || doc.status !== DocumentStatus.DELETED) throw new NotFoundException('Evrak çöp kutusunda bulunamadı.');
    await this.access.assertTaxpayerAccess(user, doc.taxpayerId);

    await this.documents.update({ id }, { status: DocumentStatus.ACTIVE, deletedAt: null as unknown as Date });
    await this.audit.log({
      actorUserId: user.userId,
      action: DocumentAuditAction.RESTORED,
      entityType: DOCUMENT_ENTITY_TYPE,
      entityId: id,
      taxpayerId: doc.taxpayerId,
      metadata: { documentTitle: doc.title, documentTypeId: doc.documentTypeId },
    });
  }

  /**
   * Kalıcı silinen evraklar için kotayı mükellef bazında toplu iade eder.
   *
   * Kota, mükellefin sistemde DURAN evrak sayısını temsil ediyor; kalıcı silinen evrak
   * artık durmadığı için hakkı geri verilir (çöp kutusundakiler için verilmez — bkz.
   * QuotaService.refund).
   *
   * Şirket (`company`) kategorisindeki evraklar yüklenirken kota tüketmediği için
   * iadeye de girmez. Kategori, evrağın `documentType` ilişkisinden değil tür id
   * kümesinden okunuyor: ilişki yüklenmemiş bir çağrı yolunda `undefined !== 'company'`
   * sessizce yanlış tarafa düşüp fazladan iade üretirdi.
   *
   * İade evrak başına değil mükellef başına yapılır — "çöp kutusunu boşalt" 500 evrak
   * silerken 500 ayrı satır kilidi ve 500 defter satırı üretmesin.
   */
  /**
   * Kalıcı silmenin tx içi gövdesi — üç çağrı yolu (tek, toplu seçim, çöp kutusunu
   * boşalt) da bunu kullanır.
   *
   * Sıra kritik: ÖNCE mükellef satırları kilitlenir, SONRA evrak satırları silinip
   * kota iade edilir. DELETE de INSERT gibi FK üzerinden `taxpayer_profiles`'ta S
   * kilidi tuttuğu için, iade adımının istediği X kilidi önceden alınmazsa eşzamanlı
   * silmeler S→X yükseltmesinde deadlock'a düşer (bkz. lockTaxpayersForUpdate).
   */
  private async purgeDocumentsTx(tx: EntityManager, docs: Document[], note: string): Promise<void> {
    if (!docs.length) return;
    await this.quota.lockTaxpayersForUpdate(docs.map((d) => d.taxpayerId), tx);
    await tx.delete(Document, { id: In(docs.map((d) => d.id)) });
    await this.refundPurgedDocuments(tx, docs, note);
  }

  private async refundPurgedDocuments(tx: EntityManager, docs: Document[], note: string): Promise<void> {
    if (!docs.length) return;

    const companyTypeIds = new Set(
      (await tx.find(DocumentType, { where: { category: DocumentCategory.COMPANY } })).map((t) => t.id),
    );

    const perTaxpayer = new Map<string, number>();
    for (const d of docs) {
      if (companyTypeIds.has(d.documentTypeId)) continue;
      perTaxpayer.set(d.taxpayerId, (perTaxpayer.get(d.taxpayerId) ?? 0) + 1);
    }

    for (const [taxpayerId, count] of perTaxpayer) {
      await this.quota.refund(taxpayerId, count, {
        // Tek evrak silindiğinde defter satırı doğrudan o evrağa işaret etsin.
        referenceId: count === 1 ? docs.find((d) => d.taxpayerId === taxpayerId)?.id : undefined,
        note: count === 1 ? note : `${count} evrak — ${note}`,
        manager: tx,
      });
    }
  }

  /**
   * Kalıcı silme — yalnızca çöp kutusundaki bir evrak için. DB satırı + depolama nesnesi
   * silinir ve kota iade edilir. Satır silme ile iade aynı transaction'da: biri olup
   * diğeri olmazsa sayaç kalıcı olarak gerçek evrak sayısından ayrışırdı.
   */
  async purge(user: AuthUser, id: string): Promise<void> {
    const doc = await this.documents.findOne({ where: { id }, withDeleted: true });
    if (!doc || doc.status !== DocumentStatus.DELETED) throw new NotFoundException('Evrak çöp kutusunda bulunamadı.');
    await this.access.assertTaxpayerAccess(user, doc.taxpayerId);

    await this.dataSource.transaction(async (tx) => {
      await this.purgeDocumentsTx(tx, [doc], 'Evrak kalıcı silindi');
    });
    // Depolama silme en iyi çaba: başarısız olsa bile DB tutarlı kalmalı (yetim nesne
    // kalır; tersi olsaydı var olmayan dosyaya işaret eden bir kayıt kalırdı).
    await this.storage.delete(doc.storagePath).catch(() => undefined);
    await this.audit.log({
      actorUserId: user.userId,
      action: DocumentAuditAction.PURGED,
      entityType: DOCUMENT_ENTITY_TYPE,
      entityId: id,
      taxpayerId: doc.taxpayerId,
      metadata: { documentTitle: doc.title, documentTypeId: doc.documentTypeId },
    });
  }

  /** Verilen id'lerden erişim yetkisi olan + istenen durumdaki evrakları bulur (toplu işlemler ortak iskeleti). */
  private async findByIdsForBulk(user: AuthUser, ids: string[], status: DocumentStatus): Promise<Document[]> {
    if (!ids.length) return [];
    const docs = await this.documents.find({ where: { id: In(ids) }, withDeleted: true });
    const matching = docs.filter((d) => d.status === status);
    // Yetki kontrolü müşavir için DB'ye gidiyor — evrak başına değil, benzersiz mükellef
    // başına bir kez sorulur (500 evraklık bir seçim genelde tek mükellefe aittir).
    for (const taxpayerId of new Set(matching.map((d) => d.taxpayerId))) {
      await this.access.assertTaxpayerAccess(user, taxpayerId);
    }
    return matching;
  }

  /** Evraklar sayfasında çoklu seçim ile "Seçilenleri Sil" — birden çok evrağı tek seferde çöp kutusuna taşır. */
  async bulkRemove(user: AuthUser, ids: string[]): Promise<{ count: number }> {
    const docs = await this.findByIdsForBulk(user, ids, DocumentStatus.ACTIVE);
    if (!docs.length) return { count: 0 };

    await this.documents.update(
      { id: In(docs.map((d) => d.id)) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { status: DocumentStatus.DELETED, deletedAt: new Date() } as any,
    );
    for (const d of docs) {
      await this.audit.log({
        actorUserId: user.userId,
        action: DocumentAuditAction.DELETED,
        entityType: DOCUMENT_ENTITY_TYPE,
        entityId: d.id,
        taxpayerId: d.taxpayerId,
        metadata: { documentTitle: d.title, documentTypeId: d.documentTypeId, note: 'Toplu seçimle silme' },
      });
    }
    return { count: docs.length };
  }

  /** Çöp kutusunda çoklu seçim ile "Seçilenleri Geri Yükle". */
  async bulkRestore(user: AuthUser, ids: string[]): Promise<{ count: number }> {
    const docs = await this.findByIdsForBulk(user, ids, DocumentStatus.DELETED);
    if (!docs.length) return { count: 0 };

    await this.documents.update(
      { id: In(docs.map((d) => d.id)) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { status: DocumentStatus.ACTIVE, deletedAt: null } as any,
    );
    for (const d of docs) {
      await this.audit.log({
        actorUserId: user.userId,
        action: DocumentAuditAction.RESTORED,
        entityType: DOCUMENT_ENTITY_TYPE,
        entityId: d.id,
        taxpayerId: d.taxpayerId,
        metadata: { documentTitle: d.title, documentTypeId: d.documentTypeId, note: 'Toplu seçimle geri yükleme' },
      });
    }
    return { count: docs.length };
  }

  /** Çöp kutusunda çoklu seçim ile "Seçilenleri Kalıcı Sil". Kota iade edilir. */
  async bulkPurge(user: AuthUser, ids: string[]): Promise<{ count: number }> {
    const docs = await this.findByIdsForBulk(user, ids, DocumentStatus.DELETED);
    if (!docs.length) return { count: 0 };

    await this.dataSource.transaction(async (tx) => {
      await this.purgeDocumentsTx(tx, docs, 'toplu seçimle kalıcı silme');
    });
    await Promise.all(docs.map((d) => this.storage.delete(d.storagePath).catch(() => undefined)));
    for (const d of docs) {
      await this.audit.log({
        actorUserId: user.userId,
        action: DocumentAuditAction.PURGED,
        entityType: DOCUMENT_ENTITY_TYPE,
        entityId: d.id,
        taxpayerId: d.taxpayerId,
        metadata: { documentTitle: d.title, documentTypeId: d.documentTypeId, note: 'Toplu seçimle kalıcı silme' },
      });
    }
    return { count: docs.length };
  }

  /**
   * Çöp Kutusunu Boşalt — erişim kapsamındaki (opsiyonel olarak tek bir mükellefle
   * sınırlı) çöp kutusundaki TÜM evrakları tek seferde kalıcı olarak siler. Filtre
   * uygulanmaz; kullanıcı önce tek tek seçmek zorunda kalmadan çöp kutusunu temizler.
   * Silinen her evrağın kotası iade edilir (mükellef başına tek defter satırı).
   */
  async emptyTrash(user: AuthUser, taxpayerId?: string): Promise<{ count: number }> {
    const scope = await this.access.accessibleTaxpayerIds(user);
    if (scope !== 'ALL' && scope.length === 0) return { count: 0 };

    const qb = this.documents.createQueryBuilder('d').withDeleted().where('d.status = :status', { status: DocumentStatus.DELETED });
    if (taxpayerId) {
      await this.access.assertTaxpayerAccess(user, taxpayerId);
      qb.andWhere('d.taxpayer_id = :tp', { tp: taxpayerId });
    } else if (scope !== 'ALL') {
      qb.andWhere('d.taxpayer_id IN (:...ids)', { ids: scope });
    }

    const docs = await qb.getMany();
    if (!docs.length) return { count: 0 };

    await this.dataSource.transaction(async (tx) => {
      await this.purgeDocumentsTx(tx, docs, 'çöp kutusunu boşaltma');
    });
    await Promise.all(docs.map((d) => this.storage.delete(d.storagePath).catch(() => undefined)));
    for (const d of docs) {
      await this.audit.log({
        actorUserId: user.userId,
        action: DocumentAuditAction.PURGED,
        entityType: DOCUMENT_ENTITY_TYPE,
        entityId: d.id,
        taxpayerId: d.taxpayerId,
        metadata: { documentTitle: d.title, documentTypeId: d.documentTypeId, note: 'Çöp kutusunu boşaltma' },
      });
    }
    return { count: docs.length };
  }

  /** Evrak Logları sayfası — yükleme/düzenleme/silme/geri yükleme/kalıcı silme işlemleri, işlemi yapan kullanıcıyla. */
  async listLogs(user: AuthUser, query: QueryDocumentLogsDto): Promise<Paginated<AuditLogView>> {
    const scope = await this.access.accessibleTaxpayerIds(user);
    if (query.taxpayerId) await this.access.assertTaxpayerAccess(user, query.taxpayerId);

    return this.audit.list({
      entityType: DOCUMENT_ENTITY_TYPE,
      entityId: query.documentId,
      taxpayerIds: query.taxpayerId ? [query.taxpayerId] : scope,
      action: query.action,
      cursor: query.cursor,
      page: query.page,
      limit: query.limit,
    });
  }

  /** KDV Hesaplama — iki tarih arasında, seçili evrak türlerinde toplam KDV + tür kırılımı. */
  async vatSummary(user: AuthUser, query: VatSummaryQueryDto): Promise<VatSummary> {
    const scope = await this.access.accessibleTaxpayerIds(user);
    if (scope !== 'ALL' && scope.length === 0) return { total: 0, byType: [] };

    const qb = this.documents
      .createQueryBuilder('d')
      .select('d.document_type_id', 'documentTypeId')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(d.meta_tax_amount), 0)', 'total')
      .where('d.status = :status', { status: DocumentStatus.ACTIVE })
      .andWhere('d.document_date BETWEEN :df AND :dt', { df: query.dateFrom, dt: query.dateTo });

    if (query.taxpayerId) {
      await this.access.assertTaxpayerAccess(user, query.taxpayerId);
      qb.andWhere('d.taxpayer_id = :tp', { tp: query.taxpayerId });
    } else if (scope !== 'ALL') {
      qb.andWhere('d.taxpayer_id IN (:...ids)', { ids: scope });
    }
    if (query.documentTypeIds?.length) {
      qb.andWhere('d.document_type_id IN (:...types)', { types: query.documentTypeIds });
    }

    const rows: { documentTypeId: number; count: string; total: string }[] = await qb
      .groupBy('d.document_type_id')
      .getRawMany();

    if (!rows.length) return { total: 0, byType: [] };

    const types = await this.types.findAll();
    const typeName = (id: number) => types.find((t) => t.id === id)?.name ?? `#${id}`;

    const byType = rows.map((r) => ({
      documentTypeId: Number(r.documentTypeId),
      typeName: typeName(Number(r.documentTypeId)),
      count: Number(r.count),
      total: Number(r.total),
    }));

    return { total: byType.reduce((s, t) => s + t.total, 0), byType };
  }

  /**
   * KDV Hesaplama — bu ay/geçen ay net KDV ve devreden KDV. Devreden KDV, TÜM geçmişin
   * tek seferde (indirilecek toplamı - hesaplanan toplamı) farkı ALINARAK hesaplanamaz —
   * bu, arada KDV ÖDENEN bir ay olduğunda yanlış sonuç verir (o ayda devir sıfırlanıp
   * yalnızca kalan fazla ileri taşınır, o ayki tüm "borç" cumulative farka karışıp sonraki
   * devri olduğundan düşük gösterir). Doğrusu ay ay zincirleme: her ay için
   * `devir_ay = max(0, devir_ay-1 + indirilecek_ay - hesaplanan_ay)`. `meta_direction`
   * (alış/satış) içeren türler dışındakiler hem hesaplanan hem indirilecek toplamına
   * dahil edilmez.
   */
  async vatPeriods(user: AuthUser, query: VatPeriodsQueryDto): Promise<VatPeriodsSummary> {
    const zero: VatNet = { calculated: 0, deductible: 0, net: 0 };
    const scope = await this.access.accessibleTaxpayerIds(user);
    if (scope !== 'ALL' && scope.length === 0) return { thisMonth: zero, lastMonth: zero, carriedOver: 0 };
    if (query.taxpayerId) await this.access.assertTaxpayerAccess(user, query.taxpayerId);

    const now = new Date();
    const thisMonthKey = monthKey(now);
    const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = monthKey(lastMonthRef);
    const thisMonthEnd = monthEndIso(now);

    const monthly = await this.monthlyVat(scope, query, thisMonthEnd);

    let devir = 0;
    let enteringLastMonth: number | null = null;
    let enteringThisMonth: number | null = null;
    let lastMonthAgg = { calculated: 0, deductible: 0 };
    let thisMonthAgg = { calculated: 0, deductible: 0 };

    for (const row of monthly) {
      if (enteringLastMonth === null && row.month >= lastMonthKey) enteringLastMonth = devir;
      if (enteringThisMonth === null && row.month >= thisMonthKey) enteringThisMonth = devir;
      if (row.month === lastMonthKey) lastMonthAgg = row;
      if (row.month === thisMonthKey) thisMonthAgg = row;
      // Yalnızca KAPANMIŞ (bugünkü aydan önceki) aylar devri bir sonrakine taşır.
      if (row.month < thisMonthKey) devir = Math.max(0, devir + row.deductible - row.calculated);
    }
    if (enteringLastMonth === null) enteringLastMonth = devir;
    if (enteringThisMonth === null) enteringThisMonth = devir;

    const periodNet = (agg: { calculated: number; deductible: number }, entering: number): VatNet => ({
      calculated: agg.calculated,
      deductible: agg.deductible,
      net: agg.calculated - agg.deductible - entering,
    });

    return {
      thisMonth: periodNet(thisMonthAgg, enteringThisMonth),
      lastMonth: periodNet(lastMonthAgg, enteringLastMonth),
      carriedOver: enteringThisMonth,
    };
  }

  /** Belgesi olan her ay için (Hesaplanan, İndirilecek) toplamı — kronolojik sırayla. */
  private async monthlyVat(
    scope: string[] | 'ALL',
    query: VatPeriodsQueryDto,
    dateTo: string,
  ): Promise<Array<{ month: string; calculated: number; deductible: number }>> {
    // Z-Raporu gibi türlerde meta_direction hiç yok (alış/satış seçimi yalnızca faturalarda
    // anlamlı) — bunların KDV'si her zaman satış tarafı (Hesaplanan KDV) sayılır.
    const qb = this.documents
      .createQueryBuilder('d')
      .select("DATE_FORMAT(d.document_date, '%Y-%m')", 'month')
      .addSelect("COALESCE(SUM(CASE WHEN d.meta_direction = 'alis' THEN 0 ELSE d.meta_tax_amount END), 0)", 'calculated')
      .addSelect("COALESCE(SUM(CASE WHEN d.meta_direction = 'alis' THEN d.meta_tax_amount ELSE 0 END), 0)", 'deductible')
      .where('d.status = :status', { status: DocumentStatus.ACTIVE })
      .andWhere('d.document_date <= :dt', { dt: dateTo });

    if (query.taxpayerId) {
      qb.andWhere('d.taxpayer_id = :tp', { tp: query.taxpayerId });
    } else if (scope !== 'ALL') {
      qb.andWhere('d.taxpayer_id IN (:...ids)', { ids: scope });
    }
    if (query.documentTypeIds?.length) {
      qb.andWhere('d.document_type_id IN (:...types)', { types: query.documentTypeIds });
    }

    const rows: { month: string; calculated: string; deductible: string }[] = await qb
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany();

    return rows.map((r) => ({ month: r.month, calculated: Number(r.calculated), deductible: Number(r.deductible) }));
  }
}

/** Evrak Kayıt'ta (hızlı yükleme) başlık verilmemişse dosya adından türetilir. */
function stripExtension(filename: string): string {
  return filename.replace(/\.[^./\\]+$/, '').trim();
}

/**
 * Mali Hafıza Raporu içe aktarmada her şerit için TAZE bir Fiş Grup No üretir — ay+yıl
 * okunabilir olsun diye referans tarihten türetilir, ama var olan hiçbir gruba (ör. tekil
 * Z-Raporu yüklemelerinin ay bazlı grupları) KARIŞMASIN diye rastgele bir ek taşır.
 */
function generateMaliHafizaGroupNo(referenceDate: string): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(referenceDate) ? `${referenceDate.slice(5, 7)}${referenceDate.slice(0, 4)}` : 'MH';
  const suffix = randomUUID().replace(/-/g, '').slice(0, 4);
  return `${base}-mh${suffix}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function monthEndIso(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(last)}`;
}
/** 'YYYY-MM' — sözlüksel olarak da kronolojik sıralanabilir ay anahtarı. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
