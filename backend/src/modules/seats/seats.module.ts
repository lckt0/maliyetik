import { Module } from '@nestjs/common';
import { SeatsService } from './seats.service';
import { QuotaModule } from '../quota/quota.module';

/**
 * Koltuk muhasebesi. BillingModule ve AuthorizationsModule'ün ORTAK bağımlılığı olacak
 * şekilde ayrı tutuldu: ikisinden birinin içinde dursaydı diğeriyle döngü oluşurdu
 * (BillingModule zaten AuthorizationsModule'ü içeri alıyor).
 */
@Module({
  imports: [QuotaModule],
  providers: [SeatsService],
  exports: [SeatsService],
})
export class SeatsModule {}
