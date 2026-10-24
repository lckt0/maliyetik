import { IsBoolean, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * Panel > Ayarlar. Her alan bağımsız güncellenebilir (PATCH); gönderilmeyenler
 * `users.ui_preferences` içinde olduğu gibi kalır.
 */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: 'light' | 'dark' | 'system';

  @IsOptional()
  @IsBoolean()
  sidebarLeftDocked?: boolean;

  @IsOptional()
  @IsBoolean()
  sidebarRightDocked?: boolean;

  // Ölçek serbest bir sayı: arayüzde adım adım seçiliyor ama ileride kaydırıcıya
  // dönebilir. Sınırlar okunabilirliği ve düzenin bozulmamasını garanti eder.
  @IsOptional()
  @IsNumber()
  @Min(0.85)
  @Max(1.4)
  uiScale?: number;

  @IsOptional()
  @IsIn(['comfortable', 'compact'])
  density?: 'comfortable' | 'compact';

  @IsOptional()
  @IsIn([10, 20, 50, 100])
  pageSize?: 10 | 20 | 50 | 100;

  @IsOptional()
  @IsBoolean()
  reduceMotion?: boolean;

  @IsOptional()
  @IsIn(['home', 'documents', 'upload'])
  landingPage?: 'home' | 'documents' | 'upload';

  @IsOptional()
  @IsBoolean()
  hideRightSidebar?: boolean;

  @IsOptional()
  @IsBoolean()
  emailReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  emailDocumentActivity?: boolean;

  @IsOptional()
  @IsBoolean()
  aiExperience?: boolean;
}
