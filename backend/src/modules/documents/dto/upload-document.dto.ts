import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocumentSource } from '../../../shared/enums';

/**
 * Multipart form-data ile gelir (dosya + alanlar). `metadata` JSON string
 * olarak taşınır ve türün metadata_schema'sına göre doğrulanır.
 */
export class UploadDocumentDto {
  /** Boş bırakılabilir — özellikle mobilde toplu yüklemede tür seçimi zorunlu değildir,
   * bu durumda "Belirtilmedi" türüne düşer (bkz. DocumentsService.upload). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  documentTypeId?: number;

  /** Kimin adına yükleniyor (müşavir, yetkili olduğu mükellef için). */
  @IsString()
  @IsNotEmpty()
  taxpayerId: string;

  /**
   * Evrak Kayıt (hızlı yükleme) — yalnızca tür + dosya girilir, alanlar boş kalır.
   * true ise `title` opsiyoneldir (dosya adından türetilir), `metadata` doğrulanmaz;
   * evrak `isDigitized:false` ile kaydedilir ve Evrak Dijitalleştir kuyruğuna düşer.
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  quick?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** JSON string — türe özel meta veriler. */
  @IsOptional()
  @IsString()
  metadata?: string;

  /**
   * Evrağın hangi ekrandan geldiği (ölçüm için). Tüm yükleme akışları aynı uca düştüğü
   * için sunucu bunu kendi başına ayırt edemiyor; istemci söylüyor.
   *
   * Yalnızca sayaç amaçlı bir etiket — yetki, kota ya da fiyatlandırmayı etkilemez;
   * bu yüzden istemciden gelmesi sakıncalı değil. Tanınmayan değer REDDEDİLMEZ,
   * sessizce düşürülür ve evrak `unknown` kaynağıyla kaydedilir: bir ölçüm etiketi
   * yüzünden gerçek bir yükleme başarısız olmamalı (eski istemciler de yükleyebilmeli).
   */
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (
    Object.values(DocumentSource).includes(value as DocumentSource) ? value : undefined
  ))
  source?: DocumentSource;
}
