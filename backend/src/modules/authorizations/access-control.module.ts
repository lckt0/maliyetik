import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountantAuthorization, TaxpayerProfile } from '../../database/entities';
import { AccessControlService } from './access-control.service';

/**
 * Erişim denetimi tek başına bir modül: hiçbir servise bağlı değil, yalnızca iki
 * repository kullanıyor.
 *
 * NEDEN AYRILDI: AccessControlService daha önce AuthorizationsModule'ün içindeydi ve
 * yalnızca onun için QuotaModule → AuthorizationsModule bağı vardı. Koltuk modeliyle
 * AuthorizationsModule → SeatsModule → QuotaModule bağı doğunca bu, üç modüllük bir
 * döngüye dönüştü ve uygulama açılmadı. `forwardRef` ile örtmek yerine bağ kaynağından
 * kesildi: erişim denetimine ihtiyacı olan modüller artık bu yaprak modülü alır.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AccountantAuthorization, TaxpayerProfile])],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
