import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document, DocumentType, User } from '../../database/entities';
import { AiAssistService } from './ai-assist.service';
import { AiAssistController } from './ai-assist.controller';
import { AiInsightsService } from './ai-insights.service';
import { AiUsageService } from './ai-usage.service';
import { AiModule } from '../ai/ai.module';
import { AuthorizationsModule } from '../authorizations/authorizations.module';
import { SettingsModule } from '../settings/settings.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';

/**
 * "Yapay zeka deneyimi" — evrak okuma dışındaki hafif AI özellikleri (doğal dille
 * arama, bulgu özeti, akıllı yardımcı). Ucuz metin modeliyle çalışır ve AI kredisi
 * tüketmez; maliyeti abonelik fiyatına dahildir, günlük tavanla sınırlanır.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentType, User]),
    AiModule,
    AuthorizationsModule,
    SettingsModule,
    RedisModule,
  ],
  controllers: [AiAssistController],
  providers: [AiAssistService, AiInsightsService, AiUsageService],
  exports: [AiAssistService],
})
export class AiAssistModule {}
