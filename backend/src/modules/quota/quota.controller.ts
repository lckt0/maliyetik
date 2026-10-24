import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { AccessControlService } from '../authorizations/access-control.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';
import { PageQueryDto } from '../../common/pagination/page-query.dto';

@Controller('quota')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuotaController {
  constructor(
    private readonly quota: QuotaService,
    private readonly access: AccessControlService,
  ) {}

  /** Mükellefin kendi kota özeti. */
  @Get('me')
  @Roles(Role.TAXPAYER)
  me(@CurrentUser() user: AuthUser) {
    return this.quota.summary(user.taxpayerId!);
  }

  /** Mükellefin kendi kota geçmişi (Kota sayfası). */
  @Get('me/ledger')
  @Roles(Role.TAXPAYER)
  meLedger(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto) {
    return this.quota.ledgerHistory(user.taxpayerId!, query.cursor, query.limit, query.page);
  }

  /** Müşavir — bağlı bir mükellefin kota özeti (mükellef Hesap sayfasından kapatabilir). */
  @Get('taxpayer/:taxpayerId')
  @Roles(Role.ACCOUNTANT)
  async taxpayerSummary(@CurrentUser() user: AuthUser, @Param('taxpayerId') taxpayerId: string) {
    await this.access.assertTaxpayerDataVisibleToAccountant(user, taxpayerId, 'accountantCanViewQuota');
    return this.quota.summary(taxpayerId);
  }

  /** Müşavir — bağlı bir mükellefin kota geçmişi (mükellef Hesap sayfasından kapatabilir). */
  @Get('taxpayer/:taxpayerId/ledger')
  @Roles(Role.ACCOUNTANT)
  async taxpayerLedger(@CurrentUser() user: AuthUser, @Param('taxpayerId') taxpayerId: string, @Query() query: PageQueryDto) {
    await this.access.assertTaxpayerDataVisibleToAccountant(user, taxpayerId, 'accountantCanViewQuota');
    return this.quota.ledgerHistory(taxpayerId, query.cursor, query.limit, query.page);
  }
}
