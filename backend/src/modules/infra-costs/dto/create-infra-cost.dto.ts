import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { InfraCostBillingCycle, InfraCostCategory } from '../../../shared/enums';

export class CreateInfraCostDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsEnum(InfraCostCategory)
  category: InfraCostCategory;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  provider?: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsEnum(InfraCostBillingCycle)
  billingCycle: InfraCostBillingCycle;

  @IsOptional()
  @IsDateString()
  nextBillingDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
