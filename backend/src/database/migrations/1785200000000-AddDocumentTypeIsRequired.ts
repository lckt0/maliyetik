import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Şirket Evraklarım" sayfasında hangi evrak türlerinin zorunlu olduğunu
 * (İmza Sirküsü, Vergi Levhası, Ticaret Sicil Gazetesi) belirtmek için.
 * schema.sql/seed.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql, 02_seed.sql).
 */
export class AddDocumentTypeIsRequired1785200000000 implements MigrationInterface {
  name = 'AddDocumentTypeIsRequired1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_types' AND COLUMN_NAME = 'is_required'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE document_types
          ADD COLUMN is_required TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active
      `);
      await queryRunner.query(
        `UPDATE document_types SET is_required = 1 WHERE code IN ('imza_sirkusu', 'vergi_levhasi', 'ticaret_sicil')`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'document_types' AND COLUMN_NAME = 'is_required'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE document_types DROP COLUMN is_required`);
    }
  }
}
