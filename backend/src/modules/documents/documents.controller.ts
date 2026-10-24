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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { DocumentRecognizerService } from './recognition/document-recognizer.service';
import { AiDigitizeService } from '../ai/ai-digitize.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { RecognizeDocumentDto } from './dto/recognize-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UpdateReceiptGroupDto } from './dto/update-receipt-group.dto';
import { QueryDocumentsDto } from './dto/query-documents.dto';
import { VatSummaryQueryDto } from './dto/vat-summary-query.dto';
import { VatPeriodsQueryDto } from './dto/vat-periods-query.dto';
import { QueryDocumentLogsDto } from './dto/query-document-logs.dto';
import { GroupSummaryQueryDto } from './dto/group-summary-query.dto';
import { ReceiptGroupsQueryDto } from './dto/receipt-groups-query.dto';
import { DeleteGroupQueryDto } from './dto/delete-group-query.dto';
import { RenameGroupDto } from './dto/rename-group.dto';
import { BulkIdsDto } from './dto/bulk-ids.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { Role } from '../../shared/enums';

/**
 * Ortak "Evrak Yükle" + türe özel sorgulama/listeleme uçları.
 * Hem mükellef hem mali müşavir erişir; kapsam AccessControlService ile.
 */
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TAXPAYER, Role.ACCOUNTANT, Role.ADMIN)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly recognizer: DocumentRecognizerService,
    private readonly aiDigitize: AiDigitizeService,
  ) {}

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

  /**
   * Yükleme formunda dosya seçilir seçilmez tür/alan otomatik tahmini için çağrılır.
   * Hiçbir şey kalıcı hale gelmez, kota tüketmez — yalnızca öneri döner.
   */
  @Post('recognize')
  @UseInterceptors(FileInterceptor('file'))
  recognize(
    @CurrentUser() user: AuthUser,
    @Body() dto: RecognizeDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Dosya zorunludur.');
    return this.recognizer.recognize(user, dto.taxpayerId, file);
  }

  /** Türe özel listeleme (documentTypeId query ile) + filtre + keyset pagination. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: QueryDocumentsDto) {
    return this.documents.list(user, query);
  }

  /** Çöp kutusu listesi. `:id` route'undan önce tanımlanmalı. */
  @Get('trash')
  listTrash(@CurrentUser() user: AuthUser, @Query() query: QueryDocumentsDto) {
    return this.documents.listTrash(user, query);
  }

  /** KDV Hesaplama — iki tarih + seçili evrak türlerinde toplam KDV. */
  @Get('vat-summary')
  vatSummary(@CurrentUser() user: AuthUser, @Query() query: VatSummaryQueryDto) {
    return this.documents.vatSummary(user, query);
  }

  /** KDV Hesaplama — bu ay/geçen ay/devreden KDV kartları. `:id` route'undan önce tanımlanmalı. */
  @Get('vat-periods')
  vatPeriods(@CurrentUser() user: AuthUser, @Query() query: VatPeriodsQueryDto) {
    return this.documents.vatPeriods(user, query);
  }

  /** Evrak Logları sayfası. `:id` route'undan önce tanımlanmalı. */
  @Get('logs')
  listLogs(@CurrentUser() user: AuthUser, @Query() query: QueryDocumentLogsDto) {
    return this.documents.listLogs(user, query);
  }

  /** Fiş Grup No grup satırı/detay sayfası için doğru adet+toplam. `:id` route'undan önce tanımlanmalı. */
  @Get('group-summary')
  groupSummary(@CurrentUser() user: AuthUser, @Query() query: GroupSummaryQueryDto) {
    return this.documents.groupSummary(user, query);
  }

  /** Z-Raporu "Fiş Grubu" seçimi için mevcut grup no listesi. `:id` route'undan önce tanımlanmalı. */
  @Get('receipt-groups')
  receiptGroups(@CurrentUser() user: AuthUser, @Query() query: ReceiptGroupsQueryDto) {
    return this.documents.receiptGroups(user, query);
  }

  /** Bir Fiş Grubu'ndaki tüm evrakları tek seferde çöp kutusuna taşır. `:id` route'undan önce tanımlanmalı. */
  @Delete('group')
  deleteGroup(@CurrentUser() user: AuthUser, @Query() query: DeleteGroupQueryDto) {
    return this.documents.deleteGroup(user, query.documentTypeId, query.groupNo, query.taxpayerId);
  }

  /** Evraklar sayfasında çoklu seçim — "Seçilenleri Sil". `:id` route'undan önce tanımlanmalı. */
  @Post('bulk-delete')
  bulkDelete(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
    return this.documents.bulkRemove(user, dto.ids);
  }

  /** Çöp kutusunda çoklu seçim — "Seçilenleri Geri Yükle". `:id` route'undan önce tanımlanmalı. */
  @Post('bulk-restore')
  bulkRestore(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
    return this.documents.bulkRestore(user, dto.ids);
  }

  /** Çöp kutusunda çoklu seçim — "Seçilenleri Kalıcı Sil". `:id` route'undan önce tanımlanmalı. */
  @Post('bulk-purge')
  bulkPurge(@CurrentUser() user: AuthUser, @Body() dto: BulkIdsDto) {
    return this.documents.bulkPurge(user, dto.ids);
  }

  /** Çöp Kutusunu Boşalt — filtre uygulamadan, kapsamdaki tüm çöp kutusunu kalıcı olarak siler. `:id` route'undan önce tanımlanmalı. */
  @Post('trash/empty')
  emptyTrash(@CurrentUser() user: AuthUser, @Query('taxpayerId') taxpayerId?: string) {
    return this.documents.emptyTrash(user, taxpayerId);
  }

  /** Bir Fiş Grubu'ndaki tüm evrakların Fiş Grup No'sunu tek seferde değiştirir. `:id` route'undan önce tanımlanmalı. */
  @Patch('group')
  renameGroup(@CurrentUser() user: AuthUser, @Body() dto: RenameGroupDto) {
    return this.documents.renameGroup(user, dto.documentTypeId, dto.groupNo, dto.newGroupNo, dto.taxpayerId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.getWithUrl(user, id);
  }

  /**
   * Önizleme/indirme dosya akışı. İmzalı depolama URL'i istemciye ASLA gönderilmez —
   * frontend bunu authenticated blob fetch ile açar. `TransformInterceptor`'ın genel
   * `{data}` zarfını atlamak için yanıt doğrudan `res` üzerinden yazılır.
   */
  @Get(':id/file')
  async file(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const { stream, mimeType, filename } = await this.documents.streamFile(user, id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');
    stream.on('error', () => res.destroy());
    (stream as NodeJS.ReadableStream).pipe(res);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documents.update(user, id, dto);
  }

  /** Evrak Kayıt kuyruğunda (henüz dijitalleştirilmemiş) bir evrağın grubunu (Fiş Grubu) değiştirir. */
  @Patch(':id/receipt-group')
  updateReceiptGroup(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateReceiptGroupDto) {
    return this.documents.updateReceiptGroup(user, id, dto.groupNo);
  }

  /** Evrak Dijitalleştir — Evrak Kayıt (hızlı yükleme) kuyruğundaki bir evrağı tamamlar. */
  @Patch(':id/digitize')
  digitize(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documents.digitize(user, id, dto);
  }

  /**
   * Evrak Dijitalleştir (AI) — Gemini ile alan önerisi üretir, AI kredisi düşer.
   * Hiçbir şey KALICI hale gelmez; kullanıcı öneriyi gözden geçirip yine
   * `PATCH :id/digitize` ile kaydeder.
   */
  @Post(':id/ai-digitize')
  aiDigitizeDocument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.aiDigitize.digitize(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.remove(user, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.restore(user, id);
  }

  @Delete(':id/purge')
  purge(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.purge(user, id);
  }
}
