import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Ortak listeleme sorgu parametreleri.
 * Varsayılan = keyset (cursor) pagination — milyonlarca satırda derin sayfa
 * performansı için. `cursor`, son satırın opak kodlanmış anahtarıdır.
 * Offset modu (page/limit) yalnızca küçük/yönetim listeleri için opsiyoneldir.
 */
export class PageQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 25;

  /** Keyset cursor (base64). Verilmezse ilk sayfa. */
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Offset modu (opsiyonel; cursor ile birlikte kullanılmaz). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order: 'ASC' | 'DESC' = 'DESC';
}
