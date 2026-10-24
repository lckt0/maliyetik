import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Evrak Dijitalleştir (AI) kredisi — kullanıcı bazında (mükellef veya mali
 * müşavir hesabı). schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class AddUserAiCredits1785300000000 implements MigrationInterface {
  name = 'AddUserAiCredits1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'ai_credits_limit'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE users
          ADD COLUMN ai_credits_limit BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER last_login_at,
          ADD COLUMN ai_credits_used  BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER ai_credits_limit
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'ai_credits_limit'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN ai_credits_limit, DROP COLUMN ai_credits_used`);
    }
  }
}
