import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { PageQueryDto } from '../../../common/pagination/page-query.dto';
import { DocumentCategory, InvoiceDirection } from '../../../shared/enums';

/**
 * Türe özel listeleme/filtre sorgusu. Sıcak filtreler indeksli generated
 * meta_* kolonlarına düşer (amountMin/Max, taxId, docNo); tarih aralığı
 * document_date'e; hepsi keyset pagination ile birleşir.
 */
export class QueryDocumentsDto extends PageQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  documentTypeId?: number;

  /** Kategori filtresi (ör. 'company' = Şirket Evraklarım). */
  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  @IsOptional()
  @IsString()
  dateFrom?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amountMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amountMax?: number;

  @IsOptional()
  @IsString()
  taxId?: string; // meta_tax_id (VKN/TCKN)

  @IsOptional()
  @IsString()
  docNo?: string; // meta_doc_no

  @IsOptional()
  @IsString()
  q?: string; // başlık araması

  /** Alış/Satış (yalnızca fatura türlerinde anlamlı; meta_direction) */
  @IsOptional()
  @IsIn(Object.values(InvoiceDirection))
  direction?: InvoiceDirection;

  /** Müşavirin yetkili olduğu birden çok mükelleften birine daraltma (üst bar seçici). */
  @IsOptional()
  @IsString()
  taxpayerId?: string;

  /** Tam eşleşme — meta_receipt_group_no (Fiş Grup No grup detay sayfası). */
  @IsOptional()
  @IsString()
  groupNo?: string;

  /** Evrak Dijitalleştir kuyruğu — false verilirse yalnızca alanları doldurulmamış evraklar döner. */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  isDigitized?: boolean;

  /**
   * Dijitalleştirilmiş ve dijitalleştirilmemiş evrakları BİRLİKTE döndürür.
   *
   * Varsayılan davranış (bkz. DocumentsService.list) alanları doldurulmamış evrakları
   * gizler; masaüstünde bu doğru, çünkü onların kendi sayfası var (Evrak Dijitalleştir).
   * Mobil uygulamada ise her tarama `quick` yüklendiği için `isDigitized=false` doğuyor —
   * varsayılan filtreyle kullanıcı az önce taradığı evrağı listede bulamaz, veri kaybı
   * sanırdı. Mobil istemci bu bayrağı gönderir; masaüstü hiç göndermediği için davranışı
   * bire bir korunur.
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  includeUndigitized?: boolean;
}
