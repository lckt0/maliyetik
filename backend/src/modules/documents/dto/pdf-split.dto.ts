import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class AnalyzePdfSplitDto {
  @IsString()
  taxpayerId: string;

  @IsInt()
  @Type(() => Number)
  documentTypeId: number;
}

export class PdfSegmentDto {
  @IsInt()
  @Min(1)
  startPage: number;

  @IsInt()
  @Min(1)
  endPage: number;

  @IsOptional() @IsString() @MaxLength(100) documentNo?: string;
  @IsOptional() @IsString() @MaxLength(20) documentDate?: string;
  @IsOptional() @IsString() @MaxLength(20) vknTckn?: string;
  @IsOptional() @IsString() @MaxLength(255) counterpartyTitle?: string;
  @IsOptional() @IsString() @MaxLength(30) totalAmount?: string;
  @IsOptional() @IsString() @MaxLength(30) taxAmount?: string;
}

export class CommitPdfSplitDto {
  @IsString()
  jobId: string;

  /** Üst sınır: tek PDF'ten üretilecek evrak sayısı sayfa sayısını aşamaz (bkz. MAX_PAGES). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => PdfSegmentDto)
  segments: PdfSegmentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  titlePrefix?: string;
}
