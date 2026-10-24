import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountantProfile } from '../../database/entities';
import { AccountantOverviewService } from './accountant-overview.service';
import { AccountantNotifyService } from './accountant-notify.service';
import { NotifyTaxpayersDto } from './dto/notify.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../shared/enums';

@Controller('accountants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountantsController {
  constructor(
    @InjectRepository(AccountantProfile) private readonly repo: Repository<AccountantProfile>,
    private readonly overviewService: AccountantOverviewService,
    private readonly notifyService: AccountantNotifyService,
  ) {}

  /** Müşavirin, aktif yetkisi olduğu mükelleflerine mesaj göndermesi. */
  @Post('notify')
  @Roles(Role.ACCOUNTANT)
  notify(@CurrentUser() user: AuthUser, @Body() dto: NotifyTaxpayersDto) {
    return this.notifyService.notify(user, dto.taxpayerIds, dto.title, dto.body, dto.sendEmail ?? false);
  }

  /** Müşavirin tüm mükelleflerinin tek bakışta durumu (müşavir anasayfası panosu). */
  @Get('overview')
  @Roles(Role.ACCOUNTANT)
  overview(@CurrentUser() user: AuthUser) {
    return this.overviewService.overview(user);
  }

  /** Mükellef, yetki vereceği müşaviri ararken kullanır (unvan/ruhsat). */
  @Get('search')
  @Roles(Role.TAXPAYER)
  search(@Query('q') q?: string) {
    const qb = this.repo.createQueryBuilder('a').select(['a.id', 'a.displayTitle', 'a.city', 'a.licenseNo']);
    if (q) {
      qb.where('a.display_title LIKE :q OR a.license_no LIKE :q', { q: `%${q}%` });
    }
    return qb.orderBy('a.display_title', 'ASC').limit(25).getMany();
  }
}
