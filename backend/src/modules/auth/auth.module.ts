import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailVerificationToken, PasswordResetToken, RefreshToken } from '../../database/entities';
import { UsersModule } from '../users/users.module';
import { SettingsModule } from '../settings/settings.module';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    SettingsModule,
    MailModule,
    PassportModule,
    JwtModule.register({}), // secret'lar sign/verify çağrılarında verilir
    TypeOrmModule.forFeature([RefreshToken, EmailVerificationToken, PasswordResetToken]),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
