import { IsString, MaxLength, MinLength } from 'class-validator';

export class AiSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  query: string;
}

export class AiAskDto {
  /** Uzun serbest metin bilerek sınırlı: hem maliyet hem de istem enjeksiyonu yüzeyi. */
  @IsString()
  @MinLength(3)
  @MaxLength(600)
  question: string;
}
