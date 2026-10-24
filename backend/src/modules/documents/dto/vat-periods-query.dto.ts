import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

/** KDV Hesaplama — bu ay/geçen ay/devreden KDV kartları için tür + mükellef filtresi. */
export class VatPeriodsQueryDto {
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
