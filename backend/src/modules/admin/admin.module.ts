import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountantProfile, Document, RefreshToken, TaxpayerProfile, User } from '../../database/entities';
import { QuotaModule } from '../quota/quota.module';
import { AiCreditsModule } from '../ai-credits/ai-credits.module';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { AdminController } from './admin.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminService } from './admin.service';
import { AdminUsersService } from './admin-users.service';
import { SystemMetricsService } from './system-metrics.service';

/** Süper yönetici uçları: kota tahsisi, sistem duyuruları, kullanıcı yönetimi, istatistikler, sistem ayarları. */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, TaxpayerProfile, AccountantProfile, Document, RefreshToken]),
    QuotaModule,
    AiCreditsModule,
    AnnouncementsModule,
    UsersModule,
    SettingsModule,
    AuthModule,
    RedisModule,
  ],
  controllers: [AdminController, AdminUsersController],
  providers: [AdminService, AdminUsersService, SystemMetricsService],
})
export class AdminModule {}
