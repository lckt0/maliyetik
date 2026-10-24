import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mükellefin, mevcut mali müşavirinin kendi kota/AI kredi bakiyesi ve geçmişini
 * görüp göremeyeceğini kontrol eden iki opt-out anahtarı — Hesap sayfasından
 * kapatılabilir. Varsayılan TRUE: müşavir zaten evrak yükleyip kota/kredi tüketerek
 * bu verilerle fiilen çalışıyor, yeni eklenen bu görünürlük kontrolü var olan
 * müşavir-mükellef ilişkilerini sessizce kısıtlamamalı.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class AddAccountantVisibilityFlags1785400000000 implements MigrationInterface {
  name = 'AddAccountantVisibilityFlags1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxpayer_profiles' AND COLUMN_NAME = 'accountant_can_view_quota'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE taxpayer_profiles
          ADD COLUMN accountant_can_view_quota      TINYINT(1) NOT NULL DEFAULT 1 AFTER quota_used,
          ADD COLUMN accountant_can_view_ai_credits  TINYINT(1) NOT NULL DEFAULT 1 AFTER accountant_can_view_quota
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxpayer_profiles' AND COLUMN_NAME = 'accountant_can_view_quota'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE taxpayer_profiles DROP COLUMN accountant_can_view_quota, DROP COLUMN accountant_can_view_ai_credits`);
    }
  }
}
