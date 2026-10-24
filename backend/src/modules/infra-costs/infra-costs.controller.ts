import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InfraCostsService } from './infra-costs.service';
import { GcpBillingService } from './gcp-billing.service';
import { BrevoAccountService } from './brevo-account.service';
import { CreateInfraCostDto } from './dto/create-infra-cost.dto';
import { UpdateInfraCostDto } from './dto/update-infra-cost.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';

@Controller('admin/infra-costs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class InfraCostsController {
  constructor(
    private readonly infraCosts: InfraCostsService,
    private readonly gcpBilling: GcpBillingService,
    private readonly brevo: BrevoAccountService,
  ) {}

  @Get()
  list() {
    return this.infraCosts.list();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateInfraCostDto) {
    return this.infraCosts.create(dto, user.userId);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateInfraCostDto) {
    return this.infraCosts.update(id, dto, user.userId);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.infraCosts.remove(id, user.userId);
    return { ok: true };
  }

  /** Manuel defterin üstüne eklenen canlı kullanım/harcama göstergeleri — kimlik bilgisi yoksa `configured: false`. */
  @Get('live')
  async live() {
    const [gcpBilling, brevo, storageBytes] = await Promise.all([
      this.gcpBilling.getSummary(),
      this.brevo.getSummary(),
      this.infraCosts.getStorageUsageBytes(),
    ]);
    return { gcpBilling, brevo, gcs: { storageBytes } };
  }
}
