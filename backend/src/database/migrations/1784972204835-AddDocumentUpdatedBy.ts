import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Evrak detayında "kim tarafından düzenlendi" bilgisi için `updated_by_user_id`.
 * Yüklemede yükleyenle aynı değere set edilir, her düzenlemede güncellenir.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class AddDocumentUpdatedBy1784972204835 implements MigrationInterface {
  name = 'AddDocumentUpdatedBy1784972204835';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'updated_by_user_id'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE documents
          ADD COLUMN updated_by_user_id BIGINT UNSIGNED NULL AFTER uploaded_by_user_id,
          ADD CONSTRAINT fk_doc_updater FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
      `);
      await queryRunner.query(`UPDATE documents SET updated_by_user_id = uploaded_by_user_id WHERE updated_by_user_id IS NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'updated_by_user_id'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE documents DROP FOREIGN KEY fk_doc_updater`);
      await queryRunner.query(`ALTER TABLE documents DROP COLUMN updated_by_user_id`);
    }
  }
}
