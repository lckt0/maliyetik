import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { Document } from '../../database/entities';
import { AuthUser } from '../../common/types/auth-user';
import { DocumentStatus } from '../../shared/enums';
import { AccessControlService } from '../authorizations/access-control.service';
import { AiCreditsService } from '../ai-credits/ai-credits.service';
import { AiDigitizeService } from '../ai/ai-digitize.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { DocumentTypesService } from '../document-types/document-types.service';
import { DocumentsService } from './documents.service';
import { MaliHafizaJobService } from './mali-hafiza-job.service';

const MALI_HAFIZA_POLL_MS = 3000;
const MALI_HAFIZA_TIMEOUT_MS = 4 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type AutoDigitizeStatusValue =
  | 'idle'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'stopped_credits'
  | 'failed'
  | 'interrupted';

export interface AutoDigitizeState {
  jobId: string;
  status: AutoDigitizeStatusValue;
  total: number;
  processed: number;
  success: number;
  failed: number;
  /** Mali Hafıza Raporu — kaydedilmedi (KDV oranı/ödeme türü kullanıcı onayı gerektirir),
   *  yalnızca AI analizi tamamlanıp sıraya geri bırakıldı. `success`'e de dahildir. */
  maliHafizaAnalyzed: number;
  startedByUserId: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  currentDocTitle?: string;
  cancelRequested: boolean;
}

const NOTIFICATION_TYPE = 'ai_auto_digitize_report';
const STATE_TTL_SECONDS = 24 * 60 * 60;
const STALE_AFTER_MS = 5 * 60 * 1000;

function stateKey(taxpayerId: string): string {
  return `ai_auto_digitize:${taxpayerId}`;
}

function isStale(state: AutoDigitizeState): boolean {
  return state.status === 'running' && Date.now() - new Date(state.updatedAt).getTime() > STALE_AFTER_MS;
}

/**
 * "Otomatik Modu Başlat" — bir mükellefin dijitalleştirilmemiş TÜM evraklarını sırayla
 * Gemini ile doldurup kaydeder. HTTP isteğinden bağımsız (fire-and-forget) çalışır; ilerleme
 * Redis'te tutulur (kalıcı olması gerekmiyor, TTL'li) ki kullanıcı çıkış yapsa/sayfayı
 * kapatsa da iş devam etsin ve durumu daha sonra tekrar sorgulanabilsin.
 */
@Injectable()
export class AiAutoDigitizeService {
  private readonly logger = new Logger(AiAutoDigitizeService.name);

  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly access: AccessControlService,
    private readonly aiCredits: AiCreditsService,
    private readonly aiDigitize: AiDigitizeService,
    private readonly documentsService: DocumentsService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly documentTypes: DocumentTypesService,
    private readonly maliHafizaJob: MaliHafizaJobService,
  ) {}

  async start(user: AuthUser, taxpayerId: string, documentIds?: string[]): Promise<AutoDigitizeState> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);

    const key = stateKey(taxpayerId);
    const existingRaw = await this.redis.client.get(key);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as AutoDigitizeState;
      if (existing.status === 'running' && !isStale(existing)) {
        throw new ConflictException('Otomatik dijitalleştirme zaten çalışıyor.');
      }
    }

    const now = new Date().toISOString();
    const state: AutoDigitizeState = {
      jobId: randomUUID(),
      status: 'running',
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      maliHafizaAnalyzed: 0,
      startedByUserId: user.userId,
      startedAt: now,
      updatedAt: now,
      cancelRequested: false,
    };
    await this.saveState(key, state);

    const scopedDocumentIds = documentIds?.length ? documentIds : undefined;
    void this.run(user, taxpayerId, key, state.jobId, scopedDocumentIds).catch((err) => {
      this.logger.error(`Otomatik dijitalleştirme beklenmedik şekilde durdu (taxpayer=${taxpayerId}): ${(err as Error)?.message}`);
    });

    return state;
  }

  async status(user: AuthUser, taxpayerId: string): Promise<AutoDigitizeState | { status: 'idle' }> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);
    const raw = await this.redis.client.get(stateKey(taxpayerId));
    if (!raw) return { status: 'idle' };

    const state = JSON.parse(raw) as AutoDigitizeState;
    if (isStale(state)) {
      state.status = 'interrupted';
      state.finishedAt = state.finishedAt ?? new Date().toISOString();
      await this.saveState(stateKey(taxpayerId), state);
    }
    return state;
  }

  async cancel(user: AuthUser, taxpayerId: string): Promise<AutoDigitizeState | { status: 'idle' }> {
    await this.access.assertTaxpayerAccess(user, taxpayerId);
    const key = stateKey(taxpayerId);
    const raw = await this.redis.client.get(key);
    if (!raw) return { status: 'idle' };

    const state = JSON.parse(raw) as AutoDigitizeState;
    if (state.status === 'running') {
      state.cancelRequested = true;
      await this.saveState(key, state);
    }
    return state;
  }

  private async run(user: AuthUser, taxpayerId: string, key: string, jobId: string, documentIds?: string[]): Promise<void> {
    const maliHafizaRaporuType = await this.documentTypes.findByCodeOrThrow('mali_hafiza_raporu');
    const docs = await this.documents.find({
      where: {
        taxpayerId,
        status: DocumentStatus.ACTIVE,
        isDigitized: false,
        ...(documentIds ? { id: In(documentIds) } : {}),
      },
      order: { id: 'ASC' },
    });

    let state = await this.readState(key);
    if (!state) return;
    state.total = docs.length;
    await this.saveState(key, state);

    if (!docs.length) {
      await this.finalize(key, state, 'completed');
      return;
    }

    for (const doc of docs) {
      state = await this.readState(key);
      if (!state || state.jobId !== jobId) return;

      if (state.cancelRequested) {
        await this.finalize(key, state, 'cancelled');
        return;
      }

      const { remaining } = await this.aiCredits.summary(user.userId);
      if (remaining < 1) {
        await this.finalize(key, state, 'stopped_credits');
        return;
      }

      if (doc.documentTypeId === maliHafizaRaporuType.id) {
        // Mali Hafıza Raporu KAYDEDİLEMEZ burada — her şerit için KDV oranı/ödeme türü
        // kullanıcı onayı gerektirir. Yalnızca AI analizi (Gemini) çalıştırılıp beklenir;
        // evrak `isDigitized:false` olarak sırada KALIR, ama analiz zaten hazır olduğu
        // için kullanıcı sonradan evrağı açtığında yalnızca KDV/ödeme türünü seçip onaylar.
        try {
          const started = await this.maliHafizaJob.start(user, taxpayerId, doc.id);
          const outcome = await this.waitForMaliHafizaAnalysis(user, taxpayerId, started.jobId);
          if (outcome === 'ready') {
            state.success += 1;
            state.maliHafizaAnalyzed += 1;
          } else {
            state.failed += 1;
          }
        } catch (err) {
          state.failed += 1;
          this.logger.warn(`Otomatik dijitalleştirme — Mali Hafıza Raporu analizi atlandı (document=${doc.id}): ${(err as Error)?.message}`);
        }
      } else {
        try {
          const result = await this.aiDigitize.digitize(user, doc.id);
          await this.documentsService.digitize(user, doc.id, {
            title: result.title,
            description: doc.description,
            metadata: JSON.stringify(result.metadata),
          });
          state.success += 1;
        } catch (err) {
          state.failed += 1;
          this.logger.warn(`Otomatik dijitalleştirme evrak atlandı (document=${doc.id}): ${(err as Error)?.message}`);
        }
      }

      state.processed += 1;
      state.currentDocTitle = doc.title;
      await this.saveState(key, state);
    }

    state = await this.readState(key);
    if (state && state.jobId === jobId) {
      await this.finalize(key, state, 'completed');
    }
  }

  /**
   * Mali Hafıza Raporu analizi arka planda (kendi Redis job'ında) yürüyor — otomatik mod
   * sıradaki evraka geçmeden önce bu belirli işin 'ready'/'error' gibi nihai bir duruma
   * ulaşmasını bekler (kısa aralıklarla `MaliHafizaJobService.status` sorgulayarak).
   */
  private async waitForMaliHafizaAnalysis(user: AuthUser, taxpayerId: string, jobId: string): Promise<'ready' | 'error' | 'timeout'> {
    const deadline = Date.now() + MALI_HAFIZA_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = await this.maliHafizaJob.status(user, taxpayerId);
      if ('jobId' in state && state.jobId === jobId) {
        if (state.status === 'ready') return 'ready';
        if (state.status === 'error') return 'error';
      }
      await sleep(MALI_HAFIZA_POLL_MS);
    }
    return 'timeout';
  }

  private async finalize(key: string, state: AutoDigitizeState, status: AutoDigitizeStatusValue): Promise<void> {
    state.status = status;
    state.finishedAt = new Date().toISOString();
    await this.saveState(key, state);

    const { title, body } = this.reportMessage(status, state);
    await this.notifications.create({
      userId: state.startedByUserId,
      type: NOTIFICATION_TYPE,
      title,
      body,
      metadata: {
        jobId: state.jobId,
        total: state.total,
        processed: state.processed,
        success: state.success,
        failed: state.failed,
        status,
      },
    });
  }

  private reportMessage(status: AutoDigitizeStatusValue, state: AutoDigitizeState): { title: string; body: string } {
    const progress = `${state.processed}/${state.total} evrak işlendi (${state.success} başarılı, ${state.failed} başarısız).`;
    switch (status) {
      case 'completed': {
        if (state.total === 0) {
          return { title: 'Otomatik dijitalleştirme tamamlandı', body: 'Dijitalleştirilecek evrak bulunamadı.' };
        }
        const digitized = state.success - state.maliHafizaAnalyzed;
        const parts: string[] = [];
        if (digitized > 0) parts.push(`${digitized} evrak dijitalleştirildi`);
        if (state.maliHafizaAnalyzed > 0) parts.push(`${state.maliHafizaAnalyzed} Mali Hafıza Raporu analiz edildi (KDV oranı/ödeme türü seçip onaylamanız için sırada bekliyor)`);
        if (state.failed > 0) parts.push(`${state.failed} evrak işlenemedi`);
        return { title: 'Otomatik dijitalleştirme tamamlandı', body: `${parts.join(', ')}.` };
      }
      case 'stopped_credits':
        return { title: 'Otomatik dijitalleştirme durduruldu', body: `AI krediniz tükendiği için durduruldu. ${progress}` };
      case 'cancelled':
        return { title: 'Otomatik dijitalleştirme durduruldu', body: `Talebiniz üzerine durduruldu. ${progress}` };
      default:
        return { title: 'Otomatik dijitalleştirme durdu', body: `Beklenmeyen bir hata nedeniyle durdu. ${progress}` };
    }
  }

  private async readState(key: string): Promise<AutoDigitizeState | null> {
    const raw = await this.redis.client.get(key);
    return raw ? (JSON.parse(raw) as AutoDigitizeState) : null;
  }

  private async saveState(key: string, state: AutoDigitizeState): Promise<void> {
    state.updatedAt = new Date().toISOString();
    await this.redis.client.set(key, JSON.stringify(state), 'EX', STATE_TTL_SECONDS);
  }
}
