import { IsBoolean, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Not gövdesi — düz metin. Zengin içerik/HTML bilerek desteklenmiyor (XSS yüzeyi). */
const MAX_CONTENT = 4000;

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CONTENT)
  content: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  /** ISO 8601 (UTC) — boş/null gönderilirse hatırlatıcı yok. */
  @IsOptional()
  @IsISO8601()
  remindAt?: string | null;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CONTENT)
  content?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  /**
   * `null` gönderilirse hatırlatıcı kaldırılır. `IsISO8601` null'ı reddettiği için
   * `IsOptional` ile birlikte kullanılıyor; servis tarafında null ayrıca ele alınır.
   */
  @IsOptional()
  @IsISO8601()
  remindAt?: string | null;
}
