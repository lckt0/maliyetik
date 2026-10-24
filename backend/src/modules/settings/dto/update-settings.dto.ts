import { IsArray, IsBoolean, IsIP, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  registrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  taxpayerApprovalRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  accountantApprovalRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  maintenanceMode?: boolean;

  @IsOptional()
  @IsArray()
  @IsIP(undefined, { each: true })
  maintenanceAllowedIps?: string[];

  @IsOptional()
  @IsBoolean()
  taxpayerAiEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  accountantAiEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  taxpayerMobileAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  accountantMobileAppEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  adminMobileAppEnabled?: boolean;
}
