import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  /** Küçük harfe normalize edilerek saklanır; benzersizlik serviste kontrol edilir. */
  @IsOptional()
  @Matches(/^[a-z0-9_]{3,30}$/i, { message: 'Kullanıcı adı 3-30 karakter olmalı; yalnızca harf, rakam ve alt çizgi içerebilir.' })
  username?: string;

  /** Zengin metin editöründen gelen ham HTML — kaydedilmeden önce sanitize edilir. */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  bio?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  /** Yalnızca taxpayer rolünde geçerli — mevcut mali müşavir kota bakiyesi/geçmişini görebilir mi. */
  @IsOptional()
  @IsBoolean()
  accountantCanViewQuota?: boolean;

  /** Yalnızca taxpayer rolünde geçerli — mevcut mali müşavir AI kredi bakiyesi/geçmişini görebilir mi. */
  @IsOptional()
  @IsBoolean()
  accountantCanViewAiCredits?: boolean;
}
