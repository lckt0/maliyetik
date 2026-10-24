import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kullanıcı arayüz tercihleri (tema, sol/sağ kenar çubuğu sabitleme durumu vb.)
 * cihazlar arası senkron kalması için tek bir JSON sütunda tutulur.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class AddUserUiPreferences1784971196529 implements MigrationInterface {
  name = 'AddUserUiPreferences1784971196529';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'ui_preferences'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`ALTER TABLE users ADD COLUMN ui_preferences JSON NULL AFTER is_public`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'ui_preferences'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN ui_preferences`);
    }
  }
}
