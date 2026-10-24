import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import {
  AssignPlanDto, FailPaymentDto, ReconcilePaymentDto, StartPackageDto, StartSubscriptionDto, UpdatePlanDto,
} from './dto/billing.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';
import { PlanAudience } from '../../database/entities/subscription-plan.entity';
import { BillingPeriod } from '../../database/entities/subscription.entity';
import { PaymentStatus } from '../../database/entities/payment.entity';
import { AccessControlService } from '../authorizations/access-control.service';

/** Herkese açık fiyat listesi — landing sayfası ve kayıt akışı kullanır. */
@Controller('plans')
export class PublicPlansController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  list(@Query('audience') audience?: PlanAudience) {
    return this.billing.listPlans(audience);
  }
}

/** Oturum sahibinin abonelik/ödeme işlemleri. */
@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TAXPAYER, Role.ACCOUNTANT, Role.ADMIN)
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly access: AccessControlService,
  ) {}

  /** Panelin "Aboneliğim" ekranı: plan, durum, dönem sonu ve ödeme akışının açık olup olmadığı. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const [entitlements, subscription] = await Promise.all([
      this.billing.entitlements(user.userId),
      this.billing.currentSubscription(user.userId),
    ]);
    return { entitlements, subscription, paymentsEnabled: this.billing.paymentsEnabled() };
  }

  @Get('plans')
  plans(@CurrentUser() user: AuthUser) {
    return this.billing.listPlans(
      user.role === Role.ACCOUNTANT ? PlanAudience.ACCOUNTANT : PlanAudience.TAXPAYER,
    );
  }

  @Get('packages')
  packages() {
    return this.billing.listPackages();
  }

  @Get('payments')
  payments(@CurrentUser() user: AuthUser) {
    return this.billing.myPayments(user.userId);
  }

  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: StartSubscriptionDto, @Req() req: Request) {
    return this.billing.startSubscriptionCheckout(user.userId, dto.planId, BillingPeriod.YEARLY, req.ip);
  }

  @Post('cancel')
  cancel(@CurrentUser() user: AuthUser) {
    return this.billing.cancelSubscription(user.userId);
  }

  @Post('packages/checkout')
  async buyPackage(@CurrentUser() user: AuthUser, @Body() dto: StartPackageDto, @Req() req: Request) {
    // Müşavir yalnızca yetkili olduğu mükellef adına satın alabilir; mükellef yalnızca kendisi.
    await this.access.assertTaxpayerAccess(user, dto.taxpayerId);
    return this.billing.startPackageCheckout(user.userId, dto.taxpayerId, dto.packageId, req.ip);
  }
}

/** Admin: plan yönetimi ve elle abonelik atama (sanal POS gelene kadar tek tahsis yolu). */
@Controller('admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  plans() {
    return this.billing.listPlans(undefined, true);
  }

  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.billing.updatePlan(Number(id), { ...dto });
  }

  @Post('assign')
  assign(@Body() dto: AssignPlanDto) {
    return this.billing.activateSubscription(dto.userId, dto.planId, BillingPeriod.YEARLY, {
      trial: dto.trial,
      note: dto.note ?? 'Admin tarafından atandı',
    });
  }

  @Post('cancel/:userId')
  cancel(@Param('userId') userId: string) {
    return this.billing.cancelSubscription(userId, true);
  }

  // ---- Ödeme mutabakatı ----
  // Shopier api_pay4'te sunucu-sunucu webhook yok; kullanıcı ödeme sonrası sekmeyi
  // kapatırsa kayıt `pending` kalır. Bu uçlar Shopier panosuyla elle karşılaştırıp
  // eşleştirmek için.

  @Get('payments')
  payments(@Query('status') status?: PaymentStatus, @Query('limit') limit?: string) {
    return this.billing.listPayments(status, Number(limit) || 100);
  }

  @Post('payments/:id/reconcile')
  reconcile(@Param('id') id: string, @Body() dto: ReconcilePaymentDto, @CurrentUser() user: AuthUser) {
    return this.billing.reconcilePayment(id, user.userId, dto.providerRef, dto.note);
  }

  @Post('payments/:id/fail')
  failPayment(@Param('id') id: string, @Body() dto: FailPaymentDto, @CurrentUser() user: AuthUser) {
    return this.billing.markPaymentFailed(id, user.userId, dto.reason);
  }
}
