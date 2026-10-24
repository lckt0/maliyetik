import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin panelinde mobil uygulamayı kimlerin kullanabileceğini (mükellef/mali
 * müşavir rolü bazında) kontrol eden açık/kapalı anahtarlar. AI anahtarlarıyla
 * aynı desen (bkz. AddSettingsAiToggles). schema.sql ile birebir senkron.
 */
export class AddSettingsMobileToggles1785600000001 implements MigrationInterface {
  name = 'AddSettingsMobileToggles1785600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'taxpayer_mobile_app_enabled'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE system_settings
          ADD COLUMN taxpayer_mobile_app_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER accountant_ai_enabled,
          ADD COLUMN accountant_mobile_app_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER taxpayer_mobile_app_enabled
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'taxpayer_mobile_app_enabled'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(
        `ALTER TABLE system_settings DROP COLUMN taxpayer_mobile_app_enabled, DROP COLUMN accountant_mobile_app_enabled`,
      );
    }
  }
}
