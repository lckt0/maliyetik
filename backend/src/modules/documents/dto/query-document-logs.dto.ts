import { IsIn, IsOptional, IsString } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { DocumentAuditAction } from '../../../shared/enums';

/** Evrak Logları sayfası — mükellef/işlem türü filtresi + keyset pagination. */
export class QueryDocumentLogsDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  taxpayerId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsIn(Object.values(DocumentAuditAction))
  action?: DocumentAuditAction;
}
