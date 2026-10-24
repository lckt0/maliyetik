import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Grup satırı için doğru adet/toplam — evrak listesindeki gruplanmış Z-Raporu satırı ve grup detay sayfası kullanır. */
export class GroupSummaryQueryDto {
  @Type(() => Number)
  @IsInt()
  documentTypeId: number;

  @IsString()
  @IsNotEmpty()
  groupNo: string;

  @IsOptional()
  @IsString()
  taxpayerId?: string;
}
