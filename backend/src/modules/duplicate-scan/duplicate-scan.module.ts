import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Document } from '../../database/entities';
import { DuplicateScanService } from './duplicate-scan.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Document]), NotificationsModule],
  providers: [DuplicateScanService],
})
export class DuplicateScanModule {}
