import { IsArray, IsOptional, IsString } from 'class-validator';

/** Mükellef rolünde `taxpayerId` yok sayılır (backend kendi profilini zorunlu kılar); müşavir için zorunludur. */
export class AutoDigitizeDto {
  @IsString()
  taxpayerId: string;

  /** Belirtilirse yalnızca bu evraklar işlenir — boş/verilmemişse kuyruktaki TÜM evraklar işlenir. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentIds?: string[];
}
