import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Bir Fiş Grubu'ndaki tüm evrakları tek seferde çöp kutusuna taşımak için. */
export class DeleteGroupQueryDto {
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
