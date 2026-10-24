import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { GcsStorageService } from './gcs-storage.service';

/**
 * StorageService soyutlaması GcsStorageService'e bağlanır. Global — her modül
 * `StorageService` token'ını enjekte edebilir. Sağlayıcı değişimi tek satır.
 */
@Global()
@Module({
  providers: [{ provide: StorageService, useClass: GcsStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
