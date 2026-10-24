import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Dışa Aktar → Z-Raporu/Luca Excel için mükellef başına hesap kodları — tümü opsiyonel. */
export class UpdateLucaSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  lucaKasaHesapKodu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lucaKrediKartiHesapKodu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lucaYemekKartiHesapKodu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lucaKdv0ToplamHesapKodu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lucaKdv10ToplamHesapKodu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lucaKdv10HesaplananHesapKodu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lucaKdv20ToplamHesapKodu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lucaKdv20HesaplananHesapKodu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  lucaBelgeTuru?: string;
}
