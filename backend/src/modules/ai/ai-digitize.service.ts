import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Configuration } from '../../config/configuration';
import { Document } from '../../database/entities';
import { AuthUser } from '../../common/types/auth-user';
import { DocumentStatus, Role } from '../../shared/enums';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { AccessControlService } from '../authorizations/access-control.service';
import { DocumentTypesService } from '../document-types/document-types.service';
import { SettingsService } from '../settings/settings.service';
import { AiCreditsService } from '../ai-credits/ai-credits.service';
import { GeminiService } from './gemini.service';

export interface AiDigitizeResult {
  title: string;
  metadata: Record<string, string>;
  confidence: number;
  modelUsed: 'cheap' | 'advanced';
  uncertainFields: string[];
}

/**
 * "Evrak Dijitalleştir (AI)" — Gemini ile evrak alanlarını otomatik doldurur.
 * Önce ucuz modelle dener; güven eşiğin altındaysa ya da zorunlu bir kanonik
 * alan eksikse gelişmiş modelle TEKRAR dener (tek kredi — iki deneme de aynı
 * "AI ile doldur" işlemi sayılır). Sonuç DB'ye YAZILMAZ; kullanıcı formda
 * gözden geçirip mevcut `PATCH /documents/:id/digitize` ile kaydeder.
 */
@Injectable()
export class AiDigitizeService {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly access: AccessControlService,
    private readonly types: DocumentTypesService,
    private readonly settings: SettingsService,
    private readonly aiCredits: AiCreditsService,
    private readonly storage: StorageService,
    private readonly gemini: GeminiService,
    private readonly config: ConfigService<Configuration, true>,
  ) {}

  async digitize(user: AuthUser, id: string): Promise<AiDigitizeResult> {
    const doc = await this.documents.findOne({ where: { id } });
    if (!doc || doc.status === DocumentStatus.DELETED) throw new NotFoundException('Evrak bulunamadı.');
    await this.access.assertTaxpayerAccess(user, doc.taxpayerId);
    if (doc.isDigitized) throw new BadRequestException('Bu evrak zaten dijitalleştirilmiş.');
    if (!doc.mimeType || !['application/pdf'].concat(IMAGE_MIME_TYPES).includes(doc.mimeType)) {
      throw new BadRequestException('Bu dosya türü için yapay zeka ile dijitalleştirme desteklenmiyor.');
    }

    const settings = this.settings.getCached();
    const allowed = user.role === Role.ACCOUNTANT ? settings.accountantAiEnabled : settings.taxpayerAiEnabled;
    if (!allowed) throw new ForbiddenException('Yapay zeka ile dijitalleştirme hesabınız için kapatılmış.');

    const type = await this.types.findByIdOrThrow(doc.documentTypeId);
    if (type.code === 'mali_hafiza_raporu') {
      throw new BadRequestException('Bu evrak Mali Hafıza Raporu türünde — "Analiz Et" ile özel akışını kullanın.');
    }
    const fields = type.metadataSchema?.fields ?? [];
    if (!fields.length) throw new BadRequestException('Bu evrak türü için doldurulacak alan tanımlı değil.');

    await this.aiCredits.consume(user.userId, 1, doc.id);

    try {
      const buffer = await this.readFile(doc.storagePath);
      const gemini = this.config.get('gemini', { infer: true });

      let result = await this.gemini.extract(gemini.modelCheap, { buffer, mimeType: doc.mimeType }, fields);
      let modelUsed: 'cheap' | 'advanced' = 'cheap';

      const requiredMissing = (r: typeof result) => fields.some((f) => f.required && !r.fields[f.key]);
      if (result.confidence < gemini.confidenceThreshold || requiredMissing(result)) {
        result = await this.gemini.extract(gemini.modelAdvanced, { buffer, mimeType: doc.mimeType }, fields);
        modelUsed = 'advanced';
      }

      const title = result.fields.documentNo ? `${type.name} ${result.fields.documentNo}` : doc.title;
      return { title, metadata: result.fields, confidence: result.confidence, modelUsed, uncertainFields: result.uncertainFields };
    } catch (err) {
      await this.aiCredits.refund(user.userId, 1, doc.id, 'AI dijitalleştirme başarısız oldu').catch(() => undefined);
      throw err;
    }
  }

  private async readFile(storagePath: string): Promise<Buffer> {
    const stream = await this.storage.getObjectStream(storagePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
