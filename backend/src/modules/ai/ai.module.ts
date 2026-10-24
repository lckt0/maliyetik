import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../../database/entities';
import { AuthorizationsModule } from '../authorizations/authorizations.module';
import { DocumentTypesModule } from '../document-types/document-types.module';
import { SettingsModule } from '../settings/settings.module';
import { AiCreditsModule } from '../ai-credits/ai-credits.module';
import { GeminiService } from './gemini.service';
import { AiDigitizeService } from './ai-digitize.service';
import { MaliHafizaExtractService } from './mali-hafiza-extract.service';

/** Gemini destekli "Evrak Dijitalleştir (AI)" — DocumentsModule bu modülü içe aktarır. */
@Module({
  imports: [
    TypeOrmModule.forFeature([Document]),
    AuthorizationsModule,
    DocumentTypesModule,
    SettingsModule,
    AiCreditsModule,
  ],
  providers: [GeminiService, AiDigitizeService, MaliHafizaExtractService],
  // GeminiService dışa açık: PdfSplitService taranmış PDF'lerde fatura sınırlarını
  // doğrudan modele sorar (bkz. documents/pdf-split.service.ts).
  exports: [AiDigitizeService, MaliHafizaExtractService, GeminiService],
})
export class AiModule {}
