import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Dijitalleştirilmemiş bir Z-Raporu evrağının Fiş Grubu No'sunu ayarlar/değiştirir. */
export class UpdateReceiptGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  groupNo: string;
}
