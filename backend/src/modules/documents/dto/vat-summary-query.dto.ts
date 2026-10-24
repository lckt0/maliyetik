import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Matches } from 'class-validator';

/**
 * KDV Hesaplama sorgusu: iki tarih arasında, seçili evrak türlerinde
 * (belirtilmezse tüm türlerde) toplam KDV (meta_tax_amount) + tür kırılımı.
 */
export class VatSummaryQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom YYYY-MM-DD formatında olmalı.' })
  dateFrom: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo YYYY-MM-DD formatında olmalı.' })
  dateTo: string;

  /** CSV query param (ör. ?documentTypeIds=1,2,3) → number[]. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map(Number)
      : String(value)
          .split(',')
          .map((v) => Number(v.trim()))
          .filter((n) => !Number.isNaN(n)),
  )
  documentTypeIds?: number[];

  @IsOptional()
  @IsString()
  taxpayerId?: string;
}
