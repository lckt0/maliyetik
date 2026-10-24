import {
  Body, Controller, Delete, Param, Post, UploadedFile, UseGuards, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PdfSplitService } from './pdf-split.service';
import { AnalyzePdfSplitDto, CommitPdfSplitDto } from './dto/pdf-split.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';

/** Tek PDF'te birleşik gelen çoklu faturaları ayırma (analiz → onay → kaydet). */
@Controller('documents/pdf-split')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TAXPAYER, Role.ACCOUNTANT, Role.ADMIN)
export class PdfSplitController {
  constructor(private readonly service: PdfSplitService) {}

  @Post('analyze')
  @UseInterceptors(FileInterceptor('file'))
  analyze(
    @CurrentUser() user: AuthUser,
    @Body() dto: AnalyzePdfSplitDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Dosya zorunludur.');
    return this.service.analyze(user, dto.taxpayerId, dto.documentTypeId, file);
  }

  @Post('commit')
  commit(@CurrentUser() user: AuthUser, @Body() dto: CommitPdfSplitDto) {
    return this.service.commit(user, dto.jobId, dto.segments, dto.titlePrefix);
  }

  @Delete(':jobId')
  discard(@CurrentUser() user: AuthUser, @Param('jobId') jobId: string) {
    return this.service.discard(user, jobId);
  }
}
