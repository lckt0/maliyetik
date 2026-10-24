import { IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Role } from '../../../shared/enums';

/** Hedef role'e göre gereken minimum profil alanları — profil satırı yoksa transactional olarak oluşturulur. */
export class AdminChangeRoleDto {
  @IsEnum(Role)
  role: Role;

  @ValidateIf((o) => o.role === Role.TAXPAYER)
  @IsString()
  @MaxLength(255)
  companyTitle?: string;

  @ValidateIf((o) => o.role === Role.TAXPAYER)
  @IsString()
  @MaxLength(11)
  vknTckn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxOffice?: string;

  @ValidateIf((o) => o.role === Role.ACCOUNTANT)
  @IsString()
  @MaxLength(255)
  displayTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  licenseNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  officeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;
}
