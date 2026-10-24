import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Var olan bir evrağı düzenleme (başlık/açıklama/meta veri). Dosya değiştirme
 * kapsam dışı — yanlış dosya yüklendiyse mevcut Sil + yeniden yükle akışı kullanılır.
 */
export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** JSON string — türün metadata_schema'sına göre yeniden doğrulanır (wholesale replace). */
  @IsOptional()
  @IsString()
  metadata?: string;
}
