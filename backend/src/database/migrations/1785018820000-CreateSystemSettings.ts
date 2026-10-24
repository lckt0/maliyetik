import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tekil satırlı (id=1) sistem ayarları — kayıt açık/kapalı, bakım modu, IP
 * allowlist. schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class CreateSystemSettings1785018820000 implements MigrationInterface {
  name = 'CreateSystemSettings1785018820000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        CREATE TABLE system_settings (
            id                            TINYINT UNSIGNED NOT NULL DEFAULT 1,
            registration_enabled          TINYINT(1)       NOT NULL DEFAULT 1,
            taxpayer_approval_required    TINYINT(1)       NOT NULL DEFAULT 0,
            accountant_approval_required  TINYINT(1)       NOT NULL DEFAULT 0,
            maintenance_mode              TINYINT(1)       NOT NULL DEFAULT 0,
            maintenance_allowed_ips       JSON              NOT NULL,
            updated_by_user_id            BIGINT UNSIGNED   NULL,
            updated_at                    DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            CONSTRAINT fk_system_settings_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
      `);
      await queryRunner.query(
        `INSERT INTO system_settings (id, maintenance_allowed_ips) VALUES (1, JSON_ARRAY())`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS system_settings`);
  }
}
