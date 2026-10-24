import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiCreditLedger, User } from '../../database/entities';
import { AiCreditsService } from './ai-credits.service';
import { AiCreditsController } from './ai-credits.controller';
import { AuthorizationsModule } from '../authorizations/authorizations.module';

@Module({
  imports: [TypeOrmModule.forFeature([AiCreditLedger, User]), AuthorizationsModule],
  providers: [AiCreditsService],
  controllers: [AiCreditsController],
  exports: [AiCreditsService],
})
export class AiCreditsModule {}
