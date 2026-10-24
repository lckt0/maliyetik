import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSetting } from '../../database/entities';
import { SettingsService } from './settings.service';
import { SystemStatusController } from './system-status.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting])],
  providers: [SettingsService],
  controllers: [SystemStatusController],
  exports: [SettingsService],
})
export class SettingsModule {}
