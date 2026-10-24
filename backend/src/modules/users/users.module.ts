import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AccountantProfile, TaxpayerProfile, User } from '../../database/entities';
import { QuotaModule } from '../quota/quota.module';
import { UsersService } from './users.service';
import { UserActivationService } from './user-activation.service';
import { UsersController } from './users.controller';
import { PublicProfileController } from './public-profile.controller';

/** Avatar boyutu evrak yüklemesinden bağımsız, sabit ve küçük bir üst sınır taşır. */
const AVATAR_MAX_MB = 5;

@Module({
  imports: [
    TypeOrmModule.forFeature([User, TaxpayerProfile, AccountantProfile]),
    QuotaModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_MB * 1024 * 1024 },
    }),
  ],
  providers: [UsersService, UserActivationService],
  controllers: [UsersController, PublicProfileController],
  exports: [UsersService, UserActivationService],
})
export class UsersModule {}
