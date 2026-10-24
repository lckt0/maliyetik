import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}

/** Şifre sıfırlama talebi — yalnızca e-posta. Yanıt her durumda aynıdır (enumeration'a kapalı). */
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}
