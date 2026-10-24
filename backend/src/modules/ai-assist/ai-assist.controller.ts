import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiAssistService } from './ai-assist.service';
import { AiUsageService } from './ai-usage.service';
import { AiAskDto, AiSearchDto } from './dto/ai-assist.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';

/**
 * Yapay zeka deneyimi uçları. Hepsi ucuz metin modeliyle çalışır, AI kredisi tüketmez;
 * kullanıcı başına günlük tavan `AiUsageService`'te (bkz. maliyet freni).
 *
 * Ek hız sınırı: model çağrısı ücretli olduğu için dakikalık istek sayısı da kısıtlı —
 * tek bir sekmenin döngüye girmesi faturayı büyütmesin.
 */
@Controller('ai-assist')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TAXPAYER, Role.ACCOUNTANT, Role.ADMIN)
export class AiAssistController {
  constructor(
    private readonly assist: AiAssistService,
    private readonly usage: AiUsageService,
  ) {}

  /** Arayüz, yapay zeka öğelerini göstermeden önce bunu sorar. */
  @Get('status')
  async status(@CurrentUser() user: AuthUser) {
    const enabled = await this.assist.isEnabledFor(user.userId, user.role);
    return {
      enabled,
      remaining: {
        search: await this.usage.remaining(user.userId, 'search'),
        ask: await this.usage.remaining(user.userId, 'ask'),
      },
    };
  }

  @Post('search-filter')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  searchFilter(@CurrentUser() user: AuthUser, @Body() dto: AiSearchDto) {
    return this.assist.searchFilter(user, dto.query);
  }

  @Get('insights')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  insights(@CurrentUser() user: AuthUser, @Query('taxpayerId') taxpayerId: string) {
    return this.assist.insights(user, taxpayerId);
  }

  @Post('ask')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  ask(@CurrentUser() user: AuthUser, @Body() dto: AiAskDto) {
    return this.assist.ask(user, dto.question);
  }
}
