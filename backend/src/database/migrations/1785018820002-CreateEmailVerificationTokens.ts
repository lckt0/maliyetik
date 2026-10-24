import { MigrationInterface, QueryRunner } from 'typeorm';

/** Kayıt sonrası e-posta doğrulama token'ları — bkz. AuthService.register/verifyEmail. */
export class CreateEmailVerificationTokens1785018820002 implements MigrationInterface {
  name = 'CreateEmailVerificationTokens1785018820002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'email_verification_tokens'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        CREATE TABLE email_verification_tokens (
            id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id     BIGINT UNSIGNED NOT NULL,
            token_hash  CHAR(64)        NOT NULL,
            expires_at  DATETIME        NOT NULL,
            consumed_at DATETIME        NULL,
            created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_email_verif_token_hash (token_hash),
            KEY idx_email_verif_user (user_id, expires_at),
            CONSTRAINT fk_email_verif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS email_verification_tokens`);
  }
}
