import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { MaliHafizaJobService } from './mali-hafiza-job.service';
import { StartMaliHafizaJobDto } from './dto/start-mali-hafiza-job.dto';
import { CommitMaliHafizaJobDto } from './dto/commit-mali-hafiza-job.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';

/**
 * Mali Hafıza Raporu — Evrak Dijitalleştir sayfasından tetiklenen, arka planda (HTTP
 * isteğinden bağımsız) çalışan analiz+kayıt işi. Kaynak fotoğraf Evrak Kayıt'tan zaten
 * yüklenmiş olmalı ("mali_hafiza_raporu" türü, henüz dijitalleştirilmemiş) — burada
 * yeniden dosya yükleme YOK, yalnızca o evrağın id'si gönderilir. `AiAutoDigitizeController`
 * ile aynı desen: `start` hemen döner, `status` client tarafından poll edilir, bitince
 * gerçek bir bildirim oluşur (bkz. `MaliHafizaJobService`).
 */
@Controller('documents/mali-hafiza/jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TAXPAYER, Role.ACCOUNTANT, Role.ADMIN)
export class MaliHafizaJobController {
  constructor(private readonly jobs: MaliHafizaJobService) {}

  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartMaliHafizaJobDto) {
    return this.jobs.start(user, dto.taxpayerId, dto.documentId);
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser, @Query('taxpayerId') taxpayerId: string) {
    if (!taxpayerId) throw new BadRequestException('Mükellef seçimi zorunludur.');
    return this.jobs.status(user, taxpayerId);
  }

  @Post('commit')
  commit(@CurrentUser() user: AuthUser, @Body() dto: CommitMaliHafizaJobDto) {
    return this.jobs.commit(user, dto.taxpayerId, dto.strips);
  }
}
