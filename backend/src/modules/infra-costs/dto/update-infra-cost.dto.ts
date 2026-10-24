import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { InfraCostBillingCycle, InfraCostCategory } from '../../../shared/enums';

export class UpdateInfraCostDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsEnum(InfraCostCategory)
  category?: InfraCostCategory;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsEnum(InfraCostBillingCycle)
  billingCycle?: InfraCostBillingCycle;

  @IsOptional()
  @IsDateString()
  nextBillingDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
