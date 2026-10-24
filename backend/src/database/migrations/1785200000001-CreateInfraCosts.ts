import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin "Altyapı Maliyetleri" sayfasının manuel maliyet defteri.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class CreateInfraCosts1785200000001 implements MigrationInterface {
  name = 'CreateInfraCosts1785200000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'infra_costs'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        CREATE TABLE infra_costs (
            id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            name              VARCHAR(150)    NOT NULL,
            category          ENUM('server','hosting','database','storage','domain','email','other') NOT NULL DEFAULT 'other',
            provider          VARCHAR(100)    NULL,
            amount            DECIMAL(12,2)   NOT NULL,
            currency          VARCHAR(3)      NOT NULL DEFAULT 'TRY',
            billing_cycle     ENUM('monthly','yearly','one_time') NOT NULL DEFAULT 'monthly',
            next_billing_date DATE            NULL,
            note              VARCHAR(1000)   NULL,
            is_active         TINYINT(1)      NOT NULL DEFAULT 1,
            created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_infra_cost_category (category, is_active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS infra_costs`);
  }
}
