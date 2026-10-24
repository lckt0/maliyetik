import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { QuotaService } from '../quota/quota.service';
import { AiCreditsService } from '../ai-credits/ai-credits.service';
import { AnnouncementsService } from '../announcements/announcements.service';
import { AdminService } from './admin.service';
import { SystemMetricsService } from './system-metrics.service';
import { SettingsService } from '../settings/settings.service';
import { UpdateSettingsDto } from '../settings/dto/update-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { AdminAuditAction, AiCreditReason, QuotaReason, Role } from '../../shared/enums';
import { AuditService } from '../audit/audit.service';

class GrantQuotaDto {
  @IsString()
  taxpayerId: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}

class GrantAiCreditsDto {
  @IsString()
  userId: string;

  @IsInt()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}

class SendAnnouncementDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  body: string;
}

class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly quota: QuotaService,
    private readonly aiCredits: AiCreditsService,
    private readonly announcements: AnnouncementsService,
    private readonly adminService: AdminService,
    private readonly systemMetrics: SystemMetricsService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Admin, bir mükellefe manuel kota tahsis eder. */
  @Post('quota/grant')
  async grantQuota(@CurrentUser() user: AuthUser, @Body() dto: GrantQuotaDto) {
    await this.quota.grant(dto.taxpayerId, dto.amount, QuotaReason.ADMIN_GRANT, dto.note);
    await this.audit.log({
      actorUserId: user.userId,
      action: AdminAuditAction.QUOTA_GRANTED,
      entityType: 'taxpayer_profile',
      entityId: dto.taxpayerId,
      taxpayerId: dto.taxpayerId,
      metadata: { amount: dto.amount, note: dto.note },
    });
    return { ok: true };
  }

  @Get('quota/taxpayers')
  searchQuotaTaxpayers(@Query('search') search = '', @Query('limit') limit = '10') {
    return this.quota.searchTaxpayers(search, Math.min(Number(limit) || 10, 25));
  }

  @Get('quota/balance/:taxpayerId')
  getQuotaBalance(@Param('taxpayerId') taxpayerId: string) {
    return this.quota.summary(taxpayerId);
  }

  @Get('quota/ledger')
  getQuotaLedger(
    @Query('taxpayerId') taxpayerId: string,
    @Query('cursor') cursor?: string,
    @Query('page') page?: string,
    @Query('limit') limit = '20',
  ) {
    return this.quota.ledgerHistory(taxpayerId, cursor, Math.min(Number(limit) || 20, 50), page ? Number(page) : undefined);
  }

  /** Admin, bir kullanıcıya (mükellef veya mali müşavir hesabı) manuel AI kredisi tahsis eder. */
  @Post('ai-credits/grant')
  async grantAiCredits(@CurrentUser() user: AuthUser, @Body() dto: GrantAiCreditsDto) {
    await this.aiCredits.grant(dto.userId, dto.amount, AiCreditReason.ADMIN_GRANT, dto.note);
    await this.audit.log({
      actorUserId: user.userId,
      action: AdminAuditAction.AI_CREDITS_GRANTED,
      entityType: 'user',
      entityId: dto.userId,
      metadata: { amount: dto.amount, note: dto.note },
    });
    return { ok: true };
  }

  @Get('ai-credits/users')
  searchAiCreditUsers(@Query('search') search = '', @Query('limit') limit = '10') {
    return this.aiCredits.searchUsers(search, Math.min(Number(limit) || 10, 25));
  }

  @Get('ai-credits/balance/:userId')
  getAiCreditBalance(@Param('userId') userId: string) {
    return this.aiCredits.summary(userId);
  }

  @Get('ai-credits/ledger')
  getAiCreditLedger(
    @Query('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('page') page?: string,
    @Query('limit') limit = '20',
  ) {
    return this.aiCredits.ledgerHistory(userId, cursor, Math.min(Number(limit) || 20, 50), page ? Number(page) : undefined);
  }

  /** Admin, tüm aktif kullanıcılara bir sistem duyurusu gönderir (bildirim + anasayfa listesi). */
  @Post('announcements')
  async sendAnnouncement(@CurrentUser() user: AuthUser, @Body() dto: SendAnnouncementDto) {
    const announcement = await this.announcements.create(dto.title, dto.body, user.userId);
    await this.audit.log({
      actorUserId: user.userId,
      action: AdminAuditAction.ANNOUNCEMENT_CREATED,
      entityType: 'announcement',
      entityId: announcement.id,
      metadata: { title: dto.title },
    });
    return { ok: true, id: announcement.id };
  }

  @Patch('announcements/:id')
  async updateAnnouncement(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateAnnouncementDto) {
    const result = await this.announcements.update(id, dto.title, dto.body);
    await this.audit.log({
      actorUserId: user.userId, action: AdminAuditAction.ANNOUNCEMENT_UPDATED, entityType: 'announcement', entityId: id,
    });
    return result;
  }

  @Delete('announcements/:id')
  async deleteAnnouncement(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.announcements.delete(id);
    await this.audit.log({
      actorUserId: user.userId, action: AdminAuditAction.ANNOUNCEMENT_DELETED, entityType: 'announcement', entityId: id,
    });
    return { ok: true };
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('system-metrics')
  getSystemMetrics() {
    return this.systemMetrics.getMetrics();
  }

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  async updateSettings(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() dto: UpdateSettingsDto) {
    const result = await this.settings.update(dto, user.userId, req.ip ?? '');
    await this.audit.log({
      actorUserId: user.userId, action: AdminAuditAction.SETTINGS_UPDATED, entityType: 'system_setting', metadata: { ...dto },
    });
    return result;
  }

  /** Genel denetim günlüğü — tüm mükellefler/işlemler genelinde (admin'e kapsam kısıtı yok). */
  @Get('audit-logs')
  getAuditLogs(
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('cursor') cursor?: string,
    @Query('page') page?: string,
    @Query('limit') limit = '25',
  ) {
    return this.audit.list({
      action, entityType, cursor, page: page ? Number(page) : undefined,
      taxpayerIds: 'ALL', limit: Math.min(Number(limit) || 25, 50),
    });
  }
}
