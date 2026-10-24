import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotaLedger, QuotaPackage, TaxpayerProfile } from '../../database/entities';
import { QuotaService } from './quota.service';
import { QuotaController } from './quota.controller';
import { QuotaPackagesController } from './quota-packages.controller';
import { AccessControlModule } from '../authorizations/access-control.module';

@Module({
  imports: [TypeOrmModule.forFeature([QuotaLedger, TaxpayerProfile, QuotaPackage]), AccessControlModule],
  providers: [QuotaService],
  controllers: [QuotaController, QuotaPackagesController],
  exports: [QuotaService],
})
export class QuotaModule {}
