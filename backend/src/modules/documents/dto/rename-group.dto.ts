import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Bir Fiş Grubu'ndaki tüm evrakların Fiş Grup No'sunu tek seferde değiştirmek için. */
export class RenameGroupDto {
  @Type(() => Number)
  @IsInt()
  documentTypeId: number;

  @IsString()
  @IsNotEmpty()
  groupNo: string;

  @IsString()
  @IsNotEmpty()
  newGroupNo: string;

  @IsOptional()
  @IsString()
  taxpayerId?: string;
}
