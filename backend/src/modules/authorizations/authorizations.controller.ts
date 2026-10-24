import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthorizationsService } from './authorizations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';

class RequestAuthDto {
  @IsString()
  accountantId: string;
}

@Controller('authorizations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuthorizationsController {
  constructor(private readonly service: AuthorizationsService) {}

  /** Mükellef, kendine 1 müşavir yetki talebi açar. */
  @Post('request')
  @Roles(Role.TAXPAYER)
  request(@CurrentUser() user: AuthUser, @Body() dto: RequestAuthDto) {
    return this.service.requestByTaxpayer(user.taxpayerId!, dto.accountantId);
  }

  /** Müşavir talebi kabul eder. */
  @Post(':id/accept')
  @Roles(Role.ACCOUNTANT)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.accept(id, user.accountantId!);
  }

  /** Mükellef veya müşavir yetkiyi kaldırır. */
  @Post(':id/revoke')
  @Roles(Role.TAXPAYER, Role.ACCOUNTANT)
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }

  /** Müşavirin yetkili olduğu mükellefler. */
  @Get('my-taxpayers')
  @Roles(Role.ACCOUNTANT)
  myTaxpayers(@CurrentUser() user: AuthUser) {
    return this.service.listForAccountant(user.accountantId!);
  }

  /** Mükellefin kendi yetkilendirmeleri (durum + müşavir). */
  @Get('mine')
  @Roles(Role.TAXPAYER)
  mine(@CurrentUser() user: AuthUser) {
    return this.service.listForTaxpayer(user.taxpayerId!);
  }
}
