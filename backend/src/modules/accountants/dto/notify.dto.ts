import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';

export class NotifyTaxpayersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  taxpayerIds: string[];

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  /** Düz metin — bildirimde ve e-postada kaçırılarak gösterilir (HTML kabul edilmez). */
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;
}
