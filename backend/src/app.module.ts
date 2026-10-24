import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';

import { validateEnv } from './config/env.validation';
import { configuration, Configuration } from './config/configuration';
import { ALL_ENTITIES } from './database/entities';

import { StorageModule } from './infrastructure/storage/storage.module';
import { RenderModule } from './infrastructure/render/render.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TaxpayersModule } from './modules/taxpayers/taxpayers.module';
import { AccountantsModule } from './modules/accountants/accountants.module';
import { AuthorizationsModule } from './modules/authorizations/authorizations.module';
import { QuotaModule } from './modules/quota/quota.module';
import { AiCreditsModule } from './modules/ai-credits/ai-credits.module';
import { BillingModule } from './modules/billing/billing.module';
import { DocumentTypesModule } from './modules/document-types/document-types.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { CompanyDocumentsModule } from './modules/company-documents/company-documents.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { AiAssistModule } from './modules/ai-assist/ai-assist.module';
import { NotesModule } from './modules/notes/notes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { DuplicateScanModule } from './modules/duplicate-scan/duplicate-scan.module';
import { SettingsModule } from './modules/settings/settings.module';
import { InfraCostsModule } from './modules/infra-costs/infra-costs.module';
import { RetentionModule } from './modules/retention/retention.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [() => configuration(validateEnv(process.env))],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) => {
        const db = config.get('database', { infer: true });
        return {
          type: 'mysql',
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          entities: ALL_ENTITIES,
          synchronize: false, // şema init SQL / migration ile yönetilir
          // Bağlantı charset'i utf8mb4 (collation id 45). Türkçe collation
          // (utf8mb4_tr_0900_ai_ci, id>255) mysql2 handshake'inde tek byte'a
          // sığmaz; kolon/tablo seviyesinde zaten Türkçe collation uygulanır.
          charset: 'utf8mb4',
          /**
           * Bağlantının saat dilimi. Sürücü, JS `Date`'lerini bu dilime göre DATETIME
           * metnine çevirir ve okurken de bu dilimden yorumlar.
           *
           * MySQL Europe/Istanbul saatinde çalışır ve `CURRENT_TIMESTAMP` yerel duvar
           * saatini yazar; uygulamanın yazdığı tarihler de aynı dilimde olmalı, aksi halde
           * aynı tabloda üç saat kayık iki tarih ailesi oluşur ve okunan değerler yanlış
           * güne düşer. Türkiye 2016'dan beri kalıcı UTC+3 (yaz saati yok), bu yüzden
           * sabit ofset güvenlidir.
           */
          timezone: '+03:00',
          extra: { connectionLimit: 20 },
        };
      },
    }),

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),

    // Altyapı
    StorageModule,
    RenderModule,
    AuditModule,

    // Domain
    AuthModule,
    UsersModule,
    TaxpayersModule,
    AccountantsModule,
    AuthorizationsModule,
    QuotaModule,
    AiCreditsModule,
    BillingModule,
    DocumentTypesModule,
    DocumentsModule,
    CompanyDocumentsModule,
    AdminModule,
    HealthModule,
    AiAssistModule,
    NotesModule,
    NotificationsModule,
    AnnouncementsModule,
    DuplicateScanModule,
    SettingsModule,
    InfraCostsModule,
    RetentionModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
