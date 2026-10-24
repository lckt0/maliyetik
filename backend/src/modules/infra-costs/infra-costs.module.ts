import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document, InfraCost } from '../../database/entities';
import { InfraCostsService } from './infra-costs.service';
import { InfraCostsController } from './infra-costs.controller';
import { GcpBillingService } from './gcp-billing.service';
import { BrevoAccountService } from './brevo-account.service';

/** Admin "Altyapı Maliyetleri" sayfası: manuel maliyet defteri + opsiyonel canlı GCP/Brevo veri katmanı. */
@Module({
  imports: [TypeOrmModule.forFeature([InfraCost, Document])],
  providers: [InfraCostsService, GcpBillingService, BrevoAccountService],
  controllers: [InfraCostsController],
})
export class InfraCostsModule {}
