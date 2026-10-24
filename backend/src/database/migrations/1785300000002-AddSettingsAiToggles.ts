import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin panelinde Mükellef/Mali Müşavir tarafı için ayrı AI (Evrak Dijitalleştir AI)
 * açık/kapalı anahtarları. schema.sql ile birebir senkron.
 */
export class AddSettingsAiToggles1785300000002 implements MigrationInterface {
  name = 'AddSettingsAiToggles1785300000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'taxpayer_ai_enabled'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE system_settings
          ADD COLUMN taxpayer_ai_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER maintenance_allowed_ips,
          ADD COLUMN accountant_ai_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER taxpayer_ai_enabled
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings' AND COLUMN_NAME = 'taxpayer_ai_enabled'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE system_settings DROP COLUMN taxpayer_ai_enabled, DROP COLUMN accountant_ai_enabled`);
    }
  }
}
