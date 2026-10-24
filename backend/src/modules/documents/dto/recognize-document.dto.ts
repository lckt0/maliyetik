import { IsOptional, IsString } from 'class-validator';

/**
 * `taxpayerId` opsiyoneldir — verilirse (ve erişim varsa) mükellefin kendi VKN/TCKN'si
 * alış/satış faturalarında SATICI/ALICI ayrımını (yön + karşı taraf) doğru belirlemek için
 * kullanılır. Verilmezse yön alanı boş bırakılır, kullanıcı manuel seçer.
 */
export class RecognizeDocumentDto {
  @IsOptional()
  @IsString()
  taxpayerId?: string;
}
