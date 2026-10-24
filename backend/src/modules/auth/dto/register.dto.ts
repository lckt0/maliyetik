import { Equals, IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Role } from '../../../shared/enums';

export class RegisterDto {
  @IsEnum(Role)
  @ValidateIf((o) => o.role === Role.TAXPAYER || o.role === Role.ACCOUNTANT)
  role: Role.TAXPAYER | Role.ACCOUNTANT;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @MaxLength(150)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  /**
   * Kullanım Koşulları + Gizlilik Politikası + KVKK Aydınlatma Metni onayı.
   * Zorunlu: onaysız kayıt kabul edilmez (KVKK ispat yükü — bkz. legal_consents).
   */
  @IsBoolean()
  @Equals(true, { message: 'Kayıt için kullanım koşullarını ve aydınlatma metnini onaylamanız gerekir.' })
  acceptedTerms: boolean;

  /** Tanıtım e-postaları için açık rıza — isteğe bağlı, varsayılan kapalı. */
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  // ---- Mükellef ----
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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  // ---- Mali Müşavir ----
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
