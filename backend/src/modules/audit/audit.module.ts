import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, User } from '../../database/entities';
import { AuditService } from './audit.service';

/** Global — herhangi bir modül AuditService enjekte edebilir. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, User])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
