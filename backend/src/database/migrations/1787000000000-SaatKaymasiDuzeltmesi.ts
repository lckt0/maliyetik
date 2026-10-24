import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Uygulamanın yazdığı tarihleri veritabanının yazdıklarıyla hizalar.
 *
 * SORUN: backend konteynerine `TZ` verilmemişti (UTC çalışıyordu), MySQL ise
 * Europe/Istanbul; sürücü de `timezone: 'Z'` kullanıyordu. Sonuç, aynı tabloda üç
 * saat kayık iki tarih ailesi:
 *   - Veritabanının yazdıkları (`CURRENT_TIMESTAMP`): created_at, updated_at,
 *     audit_logs.created_at → İstanbul duvar saati.
 *   - Uygulamanın yazdıkları (`new Date()`): digitized_at, deleted_at, read_at… → UTC.
 * Üretimde `digitized_at`, `created_at`'ten önce görünüyordu; bu imkânsız.
 *
 * Düzeltme iki parçalı: bağlantı `timezone` ayarı '+03:00' oldu (app.module.ts) ve bu
 * migration ESKİ kayıtları yeni sözleşmeye taşıyor. İkisi birlikte yayına çıkmalı.
 *
 * NEDEN SABİT 3 SAAT: Türkiye 2016'dan beri kalıcı UTC+3, yaz saati uygulaması yok.
 * Kayma her kayıt için aynı.
 *
 * NELER DIŞARIDA BIRAKILDI:
 *  - Token tabloları (refresh_tokens, email_verification_tokens, password_reset_tokens).
 *    `expires_at`'i ileri almak token ömrünü UZATIR — güvenlik yönü yanlış tarafa bakar.
 *    Bu kayıtlar kısa ömürlü, kendiliğinden temizlenirler; en fazla üç saat erken
 *    geçersiz olurlar.
 *  - `created_at` / `updated_at` gibi veritabanının yazdığı kolonlar: onlar zaten doğru
 *    tarafta, dokunulursa bozulurlar.
 *
 * BİR KEZ ÇALIŞIR: migrations tablosu bunu garanti eder. İki kez çalışırsa kayıtlar
 * altı saat ileri gider, o yüzden elle tekrar çalıştırılmamalı.
 */
export class SaatKaymasiDuzeltmesi1787000000000 implements MigrationInterface {
  name = 'SaatKaymasiDuzeltmesi1787000000000';

  /** [tablo, kolon] — yalnızca uygulamanın `new Date()` ile yazdığı gösterim tarihleri. */
  private readonly kolonlar: Array<[string, string]> = [
    ['documents', 'digitized_at'],
    ['documents', 'deleted_at'],
    ['notifications', 'read_at'],
    ['users', 'email_verified_at'],
    // TypeORM'un `softDelete`'i de damgayı uygulama tarafından yazıyor.
    ['users', 'deleted_at'],
    ['accountant_authorizations', 'authorized_at'],
    ['accountant_authorizations', 'revoked_at'],
    ['subscriptions', 'canceled_at'],
    ['payments', 'paid_at'],
  ];

  private async varMi(q: QueryRunner, tablo: string, kolon: string): Promise<boolean> {
    const satir: Array<{ c: number }> = await q.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [tablo, kolon],
    );
    return Number(satir[0].c) > 0;
  }

  private async kaydir(q: QueryRunner, saat: number): Promise<void> {
    for (const [tablo, kolon] of this.kolonlar) {
      // Kolon yoksa sessizce atla: migration'lar farklı yaşlardaki veritabanlarında
      // (dev, yeni kurulum) da çalışabilmeli.
      if (!(await this.varMi(q, tablo, kolon))) continue;
      await q.query(
        `UPDATE \`${tablo}\` SET \`${kolon}\` = DATE_ADD(\`${kolon}\`, INTERVAL ? HOUR)
         WHERE \`${kolon}\` IS NOT NULL`, [saat],
      );
    }
  }

  public async up(q: QueryRunner): Promise<void> {
    await this.kaydir(q, 3);
  }

  public async down(q: QueryRunner): Promise<void> {
    await this.kaydir(q, -3);
  }
}
