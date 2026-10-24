import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccountantAuthorization, AccountantProfile, Document, DocumentType, TaxpayerProfile, User,
} from '../../database/entities';
import { AccountantsController } from './accountants.controller';
import { AccountantOverviewService } from './accountant-overview.service';
import { AccountantNotifyService } from './accountant-notify.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../../infrastructure/mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountantProfile, AccountantAuthorization, TaxpayerProfile, Document, DocumentType, User,
    ]),
    NotificationsModule,
    MailModule,
  ],
  controllers: [AccountantsController],
  providers: [AccountantOverviewService, AccountantNotifyService],
})
export class AccountantsModule {}
