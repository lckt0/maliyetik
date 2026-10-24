import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

/** Z-Raporu dijitalleştirmede "Fiş Grubu" seçimi için mevcut grup no listesi sorgusu. */
export class ReceiptGroupsQueryDto {
  @Type(() => Number)
  @IsInt()
  documentTypeId: number;

  @IsOptional()
  @IsString()
  taxpayerId?: string;
}
