import { MigrationInterface, QueryRunner } from 'typeorm';

/** Admin panelinden üretilen şifre sıfırlama bağlantıları — bkz. AuthService.adminCreatePasswordResetLink/resetPassword. */
export class CreatePasswordResetTokens1785500000000 implements MigrationInterface {
  name = 'CreatePasswordResetTokens1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'password_reset_tokens'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        CREATE TABLE password_reset_tokens (
            id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id     BIGINT UNSIGNED NOT NULL,
            token_hash  CHAR(64)        NOT NULL,
            expires_at  DATETIME        NOT NULL,
            consumed_at DATETIME        NULL,
            created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_password_reset_token_hash (token_hash),
            KEY idx_password_reset_user (user_id, expires_at),
            CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS password_reset_tokens`);
  }
}
