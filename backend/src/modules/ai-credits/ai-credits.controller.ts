import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AiCreditsService } from './ai-credits.service';
import { AccessControlService } from '../authorizations/access-control.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';
import { PageQueryDto } from '../../common/pagination/page-query.dto';

@Controller('ai-credits')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiCreditsController {
  constructor(
    private readonly aiCredits: AiCreditsService,
    private readonly access: AccessControlService,
  ) {}

  /** Oturum sahibinin kendi AI kredi özeti — "Evrak Dijitalleştir (AI)" sayfasında gösterilir. */
  @Get('me')
  @Roles(Role.TAXPAYER, Role.ACCOUNTANT)
  me(@CurrentUser() user: AuthUser) {
    return this.aiCredits.summary(user.userId);
  }

  /** Oturum sahibinin kendi AI kredi geçmişi. */
  @Get('me/ledger')
  @Roles(Role.TAXPAYER, Role.ACCOUNTANT)
  meLedger(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto) {
    return this.aiCredits.ledgerHistory(user.userId, query.cursor, query.limit, query.page);
  }

  /** Müşavir — bağlı bir mükellefin AI kredi özeti (mükellef Hesap sayfasından kapatabilir). */
  @Get('taxpayer/:taxpayerId')
  @Roles(Role.ACCOUNTANT)
  async taxpayerSummary(@CurrentUser() user: AuthUser, @Param('taxpayerId') taxpayerId: string) {
    const profile = await this.access.assertTaxpayerDataVisibleToAccountant(user, taxpayerId, 'accountantCanViewAiCredits');
    return this.aiCredits.summary(profile.userId);
  }

  /** Müşavir — bağlı bir mükellefin AI kredi geçmişi (mükellef Hesap sayfasından kapatabilir). */
  @Get('taxpayer/:taxpayerId/ledger')
  @Roles(Role.ACCOUNTANT)
  async taxpayerLedger(@CurrentUser() user: AuthUser, @Param('taxpayerId') taxpayerId: string, @Query() query: PageQueryDto) {
    const profile = await this.access.assertTaxpayerDataVisibleToAccountant(user, taxpayerId, 'accountantCanViewAiCredits');
    return this.aiCredits.ledgerHistory(profile.userId, query.cursor, query.limit, query.page);
  }
}
