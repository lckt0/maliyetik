import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { PageQueryDto } from '../../common/pagination/page-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/** Anasayfadaki "Sistem Duyuruları" bölümü — her oturum açmış kullanıcı okuyabilir. */
@Controller('announcements')
@UseGuards(JwtAuthGuard)
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.announcements.list(query.cursor ?? null, query.limit);
  }
}
