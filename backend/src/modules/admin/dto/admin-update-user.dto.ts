import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  /** Yalnızca taxpayer rolündeki kullanıcılar için — taxpayer_profiles.vkn_tckn. */
  @IsOptional()
  @Matches(/^\d{10,11}$/, { message: 'VKN/TCKN 10 veya 11 haneli rakam olmalı.' })
  vknTckn?: string;

  /** Yalnızca taxpayer rolündeki kullanıcılar için — taxpayer_profiles.company_title. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyTitle?: string;
}
