import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AiAutoDigitizeService } from './ai-auto-digitize.service';
import { AutoDigitizeDto } from './dto/auto-digitize.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';

/**
 * "Otomatik Modu Başlat" — Evrak Dijitalleştir (AI) sayfasındaki toplu/arka plan modu.
 * Admin kapsam dışı: bu sayfa zaten yalnızca mükellef/müşavir panelinde var.
 */
@Controller('ai-digitize/auto')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TAXPAYER, Role.ACCOUNTANT)
export class AiAutoDigitizeController {
  constructor(private readonly autoDigitize: AiAutoDigitizeService) {}

  @Post('start')
  start(@CurrentUser() user: AuthUser, @Body() dto: AutoDigitizeDto) {
    return this.autoDigitize.start(user, this.resolveTaxpayerId(user, dto.taxpayerId), dto.documentIds);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser, @Query('taxpayerId') taxpayerId?: string) {
    return this.autoDigitize.status(user, this.resolveTaxpayerId(user, taxpayerId));
  }

  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser, @Body() dto: AutoDigitizeDto) {
    return this.autoDigitize.cancel(user, this.resolveTaxpayerId(user, dto.taxpayerId));
  }

  /** Mükellef rolünde her zaman kendi profili kullanılır — gönderilen değer yok sayılır. */
  private resolveTaxpayerId(user: AuthUser, taxpayerId?: string): string {
    if (user.role === Role.TAXPAYER) {
      if (!user.taxpayerId) throw new BadRequestException('Mükellef profili bulunamadı.');
      return user.taxpayerId;
    }
    if (!taxpayerId) throw new BadRequestException('Mükellef seçimi zorunludur.');
    return taxpayerId;
  }
}
