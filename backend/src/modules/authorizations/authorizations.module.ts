import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountantAuthorization, TaxpayerProfile } from '../../database/entities';
import { AuthorizationsService } from './authorizations.service';
import { AuthorizationsController } from './authorizations.controller';
import { AccessControlModule } from './access-control.module';
import { SeatsModule } from '../seats/seats.module';

/**
 * AccessControlModule yeniden dışa aktarılıyor: bu modülü yalnızca erişim denetimi
 * için içeri alan modüller (documents, ai, taxpayers…) değişmeden çalışmaya devam etsin.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AccountantAuthorization, TaxpayerProfile]),
    AccessControlModule,
    SeatsModule,
  ],
  providers: [AuthorizationsService],
  controllers: [AuthorizationsController],
  exports: [AccessControlModule, AuthorizationsService],
})
export class AuthorizationsModule {}
