import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxpayerProfile } from '../../database/entities';
import { TaxpayersController } from './taxpayers.controller';
import { AuthorizationsModule } from '../authorizations/authorizations.module';

@Module({
  imports: [TypeOrmModule.forFeature([TaxpayerProfile]), AuthorizationsModule],
  controllers: [TaxpayersController],
})
export class TaxpayersModule {}
