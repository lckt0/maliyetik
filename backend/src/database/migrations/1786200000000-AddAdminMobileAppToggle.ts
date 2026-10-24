import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mobil uygulama artık üç rolün de kullanımına açık (önce yalnızca mükellefe açıktı).
 * Mükellef ve mali müşavir anahtarları zaten vardı; admin için eksik olan eklenir.
 *
 * Varsayılan 1 (açık) — mevcut iki anahtarla aynı desen.
 */
export class AddAdminMobileAppToggle1786200000000 implements MigrationInterface {
  name = 'AddAdminMobileAppToggle1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'admin_mobile_app_enabled'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE system_settings
          ADD COLUMN admin_mobile_app_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER accountant_mobile_app_enabled
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'admin_mobile_app_enabled'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE system_settings DROP COLUMN admin_mobile_app_enabled`);
    }
  }
}
