import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DocumentTypesService } from './document-types.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DocumentCategory } from '../../shared/enums';

/** Türler + metadata_schema (frontend dinamik formu bunu tüketir). */
@Controller('document-types')
@UseGuards(JwtAuthGuard)
export class DocumentTypesController {
  constructor(private readonly service: DocumentTypesService) {}

  @Get()
  list(@Query('category') category?: DocumentCategory) {
    return this.service.findAll(category);
  }
}
