import { Body, Controller, Headers, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto, VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Headers('x-client-type') clientType?: string) {
    return this.auth.login(dto.email, dto.password, clientType);
  }

  @Post('register')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    // IP ve tarayıcı bilgisi yasal onayın kanıtına yazılır (bkz. legal_consents).
    await this.auth.register(dto, ip, userAgent);
    return { ok: true };
  }

  @Post('verify-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.auth.resendVerification(dto.email);
    return { ok: true };
  }

  /**
   * Şifre sıfırlama bağlantısı ister. E-posta kayıtlı olsa da olmasa da AYNI yanıtı
   * döndürür — aksi halde uç, hangi e-postaların sistemde kayıtlı olduğunu sızdıran bir
   * numaralandırma aracına dönerdi. Sıkı hız sınırı: e-posta bombardımanına kapalı.
   */
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { ok: true };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto, @Headers('x-client-type') clientType?: string) {
    return this.auth.refresh(dto.refreshToken, clientType);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async logout(@Body() dto: RefreshDto, @CurrentUser() _user: AuthUser) {
    await this.auth.logout(dto.refreshToken);
  }
}
