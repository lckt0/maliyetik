import { IsNotEmpty, IsString } from 'class-validator';

export class StartMaliHafizaJobDto {
  @IsString()
  @IsNotEmpty()
  taxpayerId: string;

  /** Evrak Kayıt'tan yüklenmiş, henüz dijitalleştirilmemiş "mali_hafiza_raporu" türü evrağın id'si. */
  @IsString()
  @IsNotEmpty()
  documentId: string;
}
