import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, Notification } from '../../database/entities';
import { RetentionService } from './retention.service';

/** Saklama süresi dolan kayıtların gece temizliği. Denetim ucu yok — yalnızca cron. */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Notification])],
  providers: [RetentionService],
})
export class RetentionModule {}
