export interface UploadResult {
  bucket: string;
  path: string;
  size: number;
}

/** Depolama soyutlaması — GCS bugün, S3/başka sağlayıcı yarın (bağımlılık ters çevrilir). */
export abstract class StorageService {
  abstract upload(
    path: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<UploadResult>;

  abstract delete(path: string): Promise<void>;

  /**
   * Görüntüleme/indirme için kısa ömürlü imzalı URL.
   * `downloadFilename` verilirse yanıt `Content-Disposition: attachment` ile döner
   * (tarayıcı JS fetch/CORS gerekmeden doğrudan navigasyonla dosyayı indirir);
   * verilmezse satır içi (inline) görüntülemeye uygun URL üretir.
   */
  abstract getSignedReadUrl(path: string, expiresInSeconds?: number, downloadFilename?: string): Promise<string>;

  /** Doğrudan tarayıcıdan yükleme için imzalı PUT URL'i. */
  abstract getSignedUploadUrl(
    path: string,
    mimeType: string,
    expiresInSeconds?: number,
  ): Promise<string>;

  /**
   * Nesneyi backend üzerinden akış olarak okur — imzalı URL/parametre hiç
   * üretilmeden, kendi API'mizin arkasından (ör. /documents/:id/file) satır içi
   * önizleme/indirme sunmak için.
   */
  abstract getObjectStream(path: string): Promise<NodeJS.ReadableStream>;

  /** Başlangıç bağlantı testi (log için). */
  abstract healthCheck(): Promise<boolean>;
}
