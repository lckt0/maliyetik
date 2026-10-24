import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MaliHafizaCommitEntryInput, MaliHafizaCommitStripInput } from '../documents.service';

/** Tek fotoğrafta yan yana görülebilecek makul şerit/cihaz sayısı. */
export const MAX_STRIPS = 50;
/** Tek şeritteki günlük satır sayısı — bir şerit genelde bir aylık dönemi kapsar. */
export const MAX_ENTRIES_PER_STRIP = 400;

export class CommitMaliHafizaEntryDto implements MaliHafizaCommitEntryInput {
  /** Şeritte basılı "Z" numarası (ör. "0197"). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  documentNo: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tarih YYYY-MM-DD biçiminde olmalı.' })
  documentDate: string;

  // Ondalık basamak sınırlanmaz — hedef kolon DECIMAL(18,2) olduğundan fazlası zaten
  // MySQL tarafında yuvarlanır; burada reddetmek çalışan bir akışı 400'e düşürürdü.
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000_000)
  totalAmount: number;

  // Ondalık basamak sınırlanmaz — hedef kolon DECIMAL(18,2) olduğundan fazlası zaten
  // MySQL tarafında yuvarlanır; burada reddetmek çalışan bir akışı 400'e düşürürdü.
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000_000)
  taxAmount: number;
}

export class CommitMaliHafizaStripDto implements MaliHafizaCommitStripInput {
  /** Şeridin üstünde görülen cihaz etiketi (ör. "Manuel POS") — kullanıcı düzenleyebilir. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsIn(['0', '10', '20'])
  vatRate: '0' | '10' | '20';

  @IsIn(['nakit', 'kredi_karti', 'yemek_karti'])
  paymentType: 'nakit' | 'kredi_karti' | 'yemek_karti';

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_ENTRIES_PER_STRIP, { message: `Bir şeritte en fazla ${MAX_ENTRIES_PER_STRIP} günlük satır olabilir.` })
  @ValidateNested({ each: true })
  @Type(() => CommitMaliHafizaEntryDto)
  entries: CommitMaliHafizaEntryDto[];
}

export class CommitMaliHafizaJobDto {
  @IsString()
  @IsNotEmpty()
  taxpayerId: string;

  /** Gözden geçirilmiş şerit/gün verisi + her şerit için ortak KDV oranı/ödeme türü — iş kuralı doğrulaması `MaliHafizaJobService.commit` → `DocumentsService.commitMaliHafiza`'da sürüyor. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_STRIPS, { message: `Tek seferde en fazla ${MAX_STRIPS} şerit kaydedilebilir.` })
  @ValidateNested({ each: true })
  @Type(() => CommitMaliHafizaStripDto)
  strips: CommitMaliHafizaStripDto[];
}
