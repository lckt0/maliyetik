import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from '../documents/documents.service';
import { UploadDocumentDto } from '../documents/dto/upload-document.dto';
import { UpdateDocumentDto } from '../documents/dto/update-document.dto';
import { QueryDocumentsDto } from '../documents/dto/query-documents.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { DocumentCategory, Role } from '../../shared/enums';

/**
 * "Şirket Evraklarım" — imza sirküsü, vergi levhası, ticaret sicil vb. hızlı
 * erişim. Ayrı tablo yok; documents üzerinde category='company' scope'u.
 * Hem mükellef hem aktif müşavir ekleyebilir/silebilir/güncelleyebilir
 * (erişim AccessControlService ile). Kota tüketmez.
 */
@Controller('company-documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TAXPAYER, Role.ACCOUNTANT, Role.ADMIN)
export class CompanyDocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryDocumentsDto) {
    return this.documents.list(user, { ...query, category: DocumentCategory.COMPANY });
  }

  /** Her zorunlu/opsiyonel şirket evrak türünün bu mükellefte yüklü olup olmadığı — kart görünümü için. */
  @Get('status')
  status(@CurrentUser() user: AuthUser, @Query('taxpayerId') taxpayerId: string) {
    return this.documents.getCompanyDocumentStatus(user, taxpayerId);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Dosya zorunludur.');
    return this.documents.upload(user, dto, file);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.getWithUrl(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documents.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.remove(user, id);
  }
}
