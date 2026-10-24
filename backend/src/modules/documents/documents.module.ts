import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { memoryStorage } from 'multer';
import { Document, TaxpayerProfile } from '../../database/entities';
import { Configuration } from '../../config/configuration';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { DocumentRecognizerService } from './recognition/document-recognizer.service';
import { AuthorizationsModule } from '../authorizations/authorizations.module';
import { QuotaModule } from '../quota/quota.module';
import { DocumentTypesModule } from '../document-types/document-types.module';
import { AiModule } from '../ai/ai.module';
import { AiCreditsModule } from '../ai-credits/ai-credits.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { AiAutoDigitizeService } from './ai-auto-digitize.service';
import { AiAutoDigitizeController } from './ai-auto-digitize.controller';
import { MaliHafizaJobService } from './mali-hafiza-job.service';
import { PdfSplitService } from './pdf-split.service';
import { PdfSplitController } from './pdf-split.controller';
import { MaliHafizaJobController } from './mali-hafiza-job.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, TaxpayerProfile]),
    AuthorizationsModule,
    QuotaModule,
    DocumentTypesModule,
    AiModule,
    AiCreditsModule,
    NotificationsModule,
    SettingsModule,
    RedisModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.get('maxUploadMb', { infer: true }) * 1024 * 1024 },
      }),
    }),
  ],
  providers: [DocumentsService, DocumentRecognizerService, AiAutoDigitizeService, MaliHafizaJobService, PdfSplitService],
  controllers: [DocumentsController, AiAutoDigitizeController, MaliHafizaJobController, PdfSplitController],
  exports: [DocumentsService],
})
export class DocumentsModule {}
