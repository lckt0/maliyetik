import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bucket, Storage } from '@google-cloud/storage';
import { StorageService, UploadResult } from './storage.service';
import { Configuration } from '../../config/configuration';

/**
 * GCS uygulaması. Service Account JSON'u GCS_CREDENTIALS_B64 env'inden
 * (base64) okunur ve inline credential olarak verilir — diske dosya yazılmaz.
 */
@Injectable()
export class GcsStorageService extends StorageService implements OnModuleInit {
  private readonly logger = new Logger(GcsStorageService.name);
  private readonly storage: Storage;
  private readonly bucket: Bucket;
  private readonly bucketName: string;

  constructor(private readonly config: ConfigService<Configuration, true>) {
    super();
    const gcs = this.config.get('gcs', { infer: true });
    this.bucketName = gcs.bucket;

    const credentials = gcs.credentialsB64
      ? JSON.parse(Buffer.from(gcs.credentialsB64, 'base64').toString('utf8'))
      : undefined;

    this.storage = new Storage({
      projectId: gcs.projectId,
      credentials,
    });
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async onModuleInit(): Promise<void> {
    const ok = await this.healthCheck();
    this.logger.log(`GCS: ${ok ? 'yapılandırıldı' : 'kimlik BİLGİSİ YOK'} (bucket=${this.bucketName})`);
  }

  async upload(path: string, buffer: Buffer, mimeType: string): Promise<UploadResult> {
    const file = this.bucket.file(path);
    await file.save(buffer, {
      resumable: false,
      contentType: mimeType,
      metadata: { cacheControl: 'private, max-age=0' },
    });
    return { bucket: this.bucketName, path, size: buffer.length };
  }

  async delete(path: string): Promise<void> {
    await this.bucket.file(path).delete({ ignoreNotFound: true });
  }

  async getSignedReadUrl(path: string, expiresInSeconds = 300, downloadFilename?: string): Promise<string> {
    const [url] = await this.bucket.file(path).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInSeconds * 1000,
      ...(downloadFilename ? { promptSaveAs: downloadFilename } : {}),
    });
    return this.toPublicUrl(url);
  }

  async getObjectStream(path: string): Promise<NodeJS.ReadableStream> {
    return this.bucket.file(path).createReadStream();
  }

  async getSignedUploadUrl(
    path: string,
    mimeType: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const [url] = await this.bucket.file(path).getSignedUrl({
      version: 'v4',
      action: 'write',
      contentType: mimeType,
      expires: Date.now() + expiresInSeconds * 1000,
    });
    return url;
  }

  /**
   * İmzalı URL'nin gerçek `storage.googleapis.com` host'unu tarayıcıya hiç göstermeden,
   * kendi domainimiz (APP_URL) üzerinden `/files/<bucket>/<obje>?<imza>` olarak sunar.
   * Nginx bu path'i `Host: storage.googleapis.com` ile GCS'e proxy'ler (bkz. nginx.conf);
   * imza `SignedHeaders=host` içerdiğinden bu üstbilgi eşleşmesi zorunludur, path/query
   * aynen korunur — güvenlik/geçerlilik değişmez, yalnızca görünen domain gizlenir.
   */
  private toPublicUrl(gcsUrl: string): string {
    const appUrl = this.config.get('appUrl', { infer: true });
    if (!appUrl) return gcsUrl;
    const parsed = new URL(gcsUrl);
    return `${appUrl.replace(/\/+$/, '')}/files${parsed.pathname}${parsed.search}`;
  }

  async healthCheck(): Promise<boolean> {
    // Kimlik bilgisinin yüklenip client'ın kurulduğunu doğrular. Bucket düzeyi
    // izin (storage.buckets.get) veya obje okuma izni GEREKTİRMEZ; upload için
    // obje düzeyi izinler (objectAdmin/objectCreator) yeterlidir. Gerçek yazma
    // doğrulaması ilk evrak yüklemesinde gerçekleşir.
    return !!this.bucket;
  }
}
