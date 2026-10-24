import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Evrak Kayıt (hızlı yükleme) / Evrak Dijitalleştir akışı için alanlar.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class AddDocumentDigitization1784990182031 implements MigrationInterface {
  name = 'AddDocumentDigitization1784990182031';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'is_digitized'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE documents
          ADD COLUMN is_digitized TINYINT(1) NOT NULL DEFAULT 1 AFTER updated_by_user_id,
          ADD COLUMN digitized_by_user_id BIGINT UNSIGNED NULL AFTER is_digitized,
          ADD COLUMN digitized_at DATETIME NULL AFTER digitized_by_user_id,
          ADD CONSTRAINT fk_doc_digitizer FOREIGN KEY (digitized_by_user_id) REFERENCES users(id),
          ADD KEY idx_doc_digitized (taxpayer_id, is_digitized, created_at)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'is_digitized'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE documents DROP FOREIGN KEY fk_doc_digitizer`);
      await queryRunner.query(`ALTER TABLE documents DROP KEY idx_doc_digitized`);
      await queryRunner.query(`ALTER TABLE documents DROP COLUMN is_digitized, DROP COLUMN digitized_by_user_id, DROP COLUMN digitized_at`);
    }
  }
}
