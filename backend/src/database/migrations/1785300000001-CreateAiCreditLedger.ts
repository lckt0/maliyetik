import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AI kredisi hareket defteri — quota_ledger ile birebir aynı desen, users'a bağlı.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class CreateAiCreditLedger1785300000001 implements MigrationInterface {
  name = 'CreateAiCreditLedger1785300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_credit_ledger'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        CREATE TABLE ai_credit_ledger (
            id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id        BIGINT UNSIGNED NOT NULL,
            change_amount  BIGINT          NOT NULL,
            balance_after  BIGINT          NOT NULL,
            reason         ENUM('initial','admin_grant','consume','refund','adjustment') NOT NULL,
            reference_type VARCHAR(50)     NULL,
            reference_id   BIGINT UNSIGNED NULL,
            note           VARCHAR(255)    NULL,
            created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_ai_credit_user_created (user_id, created_at DESC),
            CONSTRAINT fk_ai_credit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_credit_ledger`);
  }
}
