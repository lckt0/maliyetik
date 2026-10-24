import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/** Tek istekte işlenebilecek evrak sayısı — arayüz sayfa başına en fazla 50 satır seçtirir. */
export const BULK_IDS_MAX = 500;

/** Evraklar/Çöp Kutusu toplu seçim işlemleri (toplu sil/geri yükle/kalıcı sil) için evrak id listesi. */
export class BulkIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_IDS_MAX, { message: `Tek seferde en fazla ${BULK_IDS_MAX} evrak işlenebilir.` })
  @IsString({ each: true })
  ids: string[];
}
