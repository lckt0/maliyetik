import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Document } from '../../database/entities';
import { DocumentStatus } from '../../shared/enums';
import { AuthUser } from '../../common/types/auth-user';
import { AccessControlService } from '../authorizations/access-control.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { MaliHafizaExtractService } from '../ai/mali-hafiza-extract.service';
import { MaliHafizaStripExtraction } from '../ai/gemini.service';
import { DocumentsService, MaliHafizaCommitGroupResult, MaliHafizaCommitResult, MaliHafizaCommitStripInput } from './documents.service';

export type MaliHafizaJobStatus = 'analyzing' | 'ready' | 'saving' | 'done' | 'error';

export interface MaliHafizaJobState {
  jobId: string;
  status: MaliHafizaJobStatus;
  startedByUserId: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  sourceDocumentId: string;
  fileName: string;
  errorMessage?: string;
  resolutionWarning?: string;
  strips?: MaliHafizaStripExtraction[];
  commitResult?: MaliHafizaCommitResult;
}

const ANALYSIS_NOTIFICATION_TYPE = 'mali_hafiza_analysis';
const COMMIT_NOTIFICATION_TYPE = 'mali_hafiza_commit';
const STATE_TTL_SECONDS = 24 * 60 * 60;
const STALE_AFTER_MS = 5 * 60 * 1000;

function stateKey(taxpayerId: string): string {
  return `mali_hafiza_job:${taxpayerId}`;
}
function isStale(state: MaliHafizaJobState): boolean {
  return (state.status === 'analyzing' || state.status === 'saving') && Date.now() - new Date(state.updatedAt).getTime() > STALE_AFTER_MS;
}

/**
 * Mali Hafıza Raporu içe aktarma — Evrak Kayıt'tan yüklenmiş ("mali_hafiza_raporu" türünde,
 * henüz dijitalleştirilmemiş) bir kaynak evrağı Evrak Dijitalleştir sayfasından analiz edip
 * kaydeder. HTTP isteğinden bağımsız (fire-and-forget) çalışır — `AiAutoDigitizeService` ile
 * birebir aynı desen: ilerleme Redis'te (TTL'li) tutulur, kullanıcı sayfadan ayrılsa/sekmeyi
 * değiştirse bile iş devam eder, bitince gerçek bir bildirim oluşur (zil panelinden
 * tıklanınca Evrak Dijitalleştir sayfasına döner ve durumu otomatik gösterir). Mükellef
 * başına TEK aktif iş. Kaynak fotoğraf zaten GCS'de duruyor — analiz için okunur, kayıt
 * adımında TEKRAR yüklenmez (bkz. `DocumentsService.commitMaliHafiza`).
 */
@Injectable()
export class MaliHafizaJobService {
  private readonly logger = new Logger(MaliHafizaJobService.name);

  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly access: AccessControlService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly maliHafizaExtract: MaliHafizaExtractService,
    private readonly documentsService: DocumentsService,
  ) {}

  async start(user: AuthUser, taxpayerId: string, documentId: string): Promise<MaliHafizaJobState> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);

    const doc = await this.documents.findOne({ where: { id: documentId }, relations: { documentType: true } });
    if (!doc || doc.status === DocumentStatus.DELETED) throw new NotFoundException('Evrak bulunamadı.');
    if (doc.taxpayerId !== taxpayerId) throw new BadRequestException('Evrak bu mükellefe ait değil.');
    if (doc.documentType?.code !== 'mali_hafiza_raporu') {
      throw new BadRequestException('Bu evrak bir Mali Hafıza Raporu değil.');
    }
    if (doc.isDigitized) throw new BadRequestException('Bu evrak zaten dijitalleştirilmiş.');

    const key = stateKey(taxpayerId);
    const existing = await this.readState(key);
    if (existing && (existing.status === 'analyzing' || existing.status === 'saving') && !isStale(existing)) {
      throw new ConflictException('Bu mükellef için zaten sürmekte olan bir Mali Hafıza Raporu işlemi var.');
    }

    const now = new Date().toISOString();
    const state: MaliHafizaJobState = {
      jobId: randomUUID(),
      status: 'analyzing',
      startedByUserId: user.userId,
      startedAt: now,
      updatedAt: now,
      sourceDocumentId: doc.id,
      fileName: doc.originalName || doc.title,
    };
    await this.saveState(key, state);

    void this.runAnalysis(user, taxpayerId, key, state.jobId, doc).catch((err) => {
      this.logger.error(`Mali Hafıza Raporu analizi beklenmedik şekilde durdu (taxpayer=${taxpayerId}): ${(err as Error)?.message}`);
    });

    return state;
  }

  async status(user: AuthUser, taxpayerId: string): Promise<MaliHafizaJobState | { status: 'idle' }> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);
    const state = await this.readState(stateKey(taxpayerId));
    if (!state) return { status: 'idle' };

    if (isStale(state)) {
      state.status = 'error';
      state.errorMessage = 'İşlem beklenmedik şekilde durdu. Lütfen tekrar deneyin.';
      state.finishedAt = state.finishedAt ?? new Date().toISOString();
      await this.saveState(stateKey(taxpayerId), state);
    }
    return state;
  }

  async commit(user: AuthUser, taxpayerId: string, strips: MaliHafizaCommitStripInput[]): Promise<MaliHafizaJobState> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);
    const key = stateKey(taxpayerId);
    const state = await this.readState(key);
    if (!state || state.status !== 'ready') {
      throw new BadRequestException('Onaylanacak bir Mali Hafıza Raporu analizi yok. Önce bir fotoğraf analiz edin.');
    }

    state.status = 'saving';
    await this.saveState(key, state);

    void this.runCommit(user, taxpayerId, key, state.jobId, strips, state.sourceDocumentId).catch((err) => {
      this.logger.error(`Mali Hafıza Raporu kaydı beklenmedik şekilde durdu (taxpayer=${taxpayerId}): ${(err as Error)?.message}`);
    });

    return state;
  }

  private async runAnalysis(user: AuthUser, taxpayerId: string, key: string, jobId: string, doc: Document): Promise<void> {
    let state = await this.readState(key);
    if (!state || state.jobId !== jobId) return;

    try {
      if (!doc.mimeType) throw new BadRequestException('Evrağın dosya türü bilinmiyor.');
      const buffer = await this.readFile(doc.storagePath);
      const result = await this.maliHafizaExtract.extract(user, { buffer, mimetype: doc.mimeType });
      state = await this.readState(key);
      if (!state || state.jobId !== jobId) return;
      state.strips = result.strips;
      state.resolutionWarning = result.resolutionWarning;
      await this.finalizeAnalysis(taxpayerId, key, state, 'ready');
    } catch (err) {
      state = await this.readState(key);
      if (!state || state.jobId !== jobId) return;
      state.errorMessage = (err as { message?: string })?.message || 'Analiz başarısız oldu.';
      await this.finalizeAnalysis(taxpayerId, key, state, 'error');
    }
  }

  private async runCommit(
    user: AuthUser,
    taxpayerId: string,
    key: string,
    jobId: string,
    strips: MaliHafizaCommitStripInput[],
    sourceDocumentId: string,
  ): Promise<void> {
    try {
      const source = await this.documents.findOne({ where: { id: sourceDocumentId } });
      if (!source) throw new NotFoundException('Kaynak Mali Hafıza Raporu evrağı bulunamadı.');

      const result = await this.documentsService.commitMaliHafiza(user, taxpayerId, strips, {
        storageBucket: source.storageBucket,
        storagePath: source.storagePath,
        originalName: source.originalName,
        mimeType: source.mimeType,
        fileSize: source.fileSize,
        checksumSha256: source.checksumSha256,
      });
      await this.documentsService.finalizeMaliHafizaSource(user, sourceDocumentId, taxpayerId, result);

      const state = await this.readState(key);
      if (!state || state.jobId !== jobId) return;
      state.commitResult = result;
      await this.finalizeCommit(taxpayerId, key, state, 'done');
    } catch (err) {
      const state = await this.readState(key);
      if (!state || state.jobId !== jobId) return;
      state.errorMessage = (err as { message?: string })?.message || 'Kaydetme başarısız oldu.';
      await this.finalizeCommit(taxpayerId, key, state, 'error');
    }
  }

  private async finalizeAnalysis(taxpayerId: string, key: string, state: MaliHafizaJobState, status: 'ready' | 'error'): Promise<void> {
    state.status = status;
    state.finishedAt = new Date().toISOString();
    await this.saveState(key, state);

    const stripCount = state.strips?.length ?? 0;
    const entryCount = state.strips?.reduce((s, x) => s + x.entries.length, 0) ?? 0;
    const { title, body } = status === 'ready'
      ? {
        title: 'Mali Hafıza Raporu analiz edildi',
        body: `${stripCount} şerit, ${entryCount} gün bulundu — KDV oranı ve ödeme türünü seçip onaylamak için tıklayın.`,
      }
      : { title: 'Mali Hafıza Raporu analizi başarısız', body: state.errorMessage ?? 'Bilinmeyen bir hata oluştu.' };

    await this.notifications.create({
      userId: state.startedByUserId,
      type: ANALYSIS_NOTIFICATION_TYPE,
      title,
      body,
      metadata: { jobId: state.jobId, taxpayerId, status, sourceDocumentId: state.sourceDocumentId },
    });
  }

  private async finalizeCommit(taxpayerId: string, key: string, state: MaliHafizaJobState, status: 'done' | 'error'): Promise<void> {
    state.status = status;
    state.finishedAt = new Date().toISOString();
    await this.saveState(key, state);

    const { title, body } = status === 'done'
      ? {
        title: 'Mali Hafıza Raporu kaydedildi',
        body: this.commitSummary(state.commitResult),
      }
      : { title: 'Mali Hafıza Raporu kaydedilemedi', body: state.errorMessage ?? 'Bilinmeyen bir hata oluştu.' };

    await this.notifications.create({
      userId: state.startedByUserId,
      type: COMMIT_NOTIFICATION_TYPE,
      title,
      body,
      metadata: { jobId: state.jobId, taxpayerId, status, sourceDocumentId: state.sourceDocumentId },
    });
  }

  private commitSummary(result?: MaliHafizaCommitResult): string {
    if (!result) return '';
    const groups: MaliHafizaCommitGroupResult[] = result.groups;
    return `${result.totalDocuments} adet Z-Raporu kaydı, ${groups.length} yeni fiş grubunda oluşturuldu.`;
  }

  private async readFile(storagePath: string): Promise<Buffer> {
    const stream = await this.storage.getObjectStream(storagePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async readState(key: string): Promise<MaliHafizaJobState | null> {
    const raw = await this.redis.client.get(key);
    return raw ? (JSON.parse(raw) as MaliHafizaJobState) : null;
  }

  private async saveState(key: string, state: MaliHafizaJobState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    await this.redis.client.set(key, JSON.stringify(state), 'EX', STATE_TTL_SECONDS);
  }
}
