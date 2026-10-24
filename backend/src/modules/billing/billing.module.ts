import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Payment, QuotaPackage, Subscription, SubscriptionPlan, TaxpayerProfile, User,
} from '../../database/entities';
import { BillingService } from './billing.service';
import { AdminBillingController, BillingController, PublicPlansController } from './billing.controller';
import { PaymentsCallbackController } from './payments.controller';
import { PAYMENT_PROVIDER } from './providers/payment-provider';
import { MockPaymentProvider } from './providers/mock.provider';
import { IyzicoPaymentProvider } from './providers/iyzico.provider';
import { ShopierPaymentProvider } from './providers/shopier.provider';
import { QuotaModule } from '../quota/quota.module';
import { AiCreditsModule } from '../ai-credits/ai-credits.module';
import { AuthorizationsModule } from '../authorizations/authorizations.module';
import { SeatsModule } from '../seats/seats.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../../infrastructure/mail/mail.module';

/**
 * Abonelik + ek kota satışı. Sanal POS sağlayıcısı `PAYMENT_PROVIDER` env değeriyle
 * seçilir; varsayılan `mock` (gerçek para hareketi yok, üretimde ödeme akışı kapalı
 * kalır — bkz. BillingService.paymentsEnabled).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionPlan, Subscription, Payment, QuotaPackage, User, TaxpayerProfile]),
    QuotaModule,
    AiCreditsModule,
    AuthorizationsModule,
    SeatsModule,
    NotificationsModule,
    MailModule,
  ],
  controllers: [PublicPlansController, BillingController, AdminBillingController, PaymentsCallbackController],
  providers: [
    BillingService,
    MockPaymentProvider,
    IyzicoPaymentProvider,
    ShopierPaymentProvider,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, MockPaymentProvider, IyzicoPaymentProvider, ShopierPaymentProvider],
      useFactory: (
        config: ConfigService,
        mock: MockPaymentProvider,
        iyzico: IyzicoPaymentProvider,
        shopier: ShopierPaymentProvider,
      ) => {
        switch (config.get('PAYMENT_PROVIDER')) {
          case 'shopier': return shopier;
          case 'iyzico': return iyzico;
          default: return mock;
        }
      },
    },
  ],
  exports: [BillingService],
})
export class BillingModule {}
