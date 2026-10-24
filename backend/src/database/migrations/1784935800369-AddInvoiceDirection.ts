import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * e-Fatura / e-Arşiv Fatura için "Alış/Satış" (direction) alanı:
 *  - documents.meta_direction generated STORED kolonu + indeks
 *  - document_types.metadata_schema'ya ilgili iki tür için `direction` alanı
 * schema.sql / seed.sql ile birebir senkron (bkz. docker/mysql/init).
 */
export class AddInvoiceDirection1784935800369 implements MigrationInterface {
  name = 'AddInvoiceDirection1784935800369';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'meta_direction'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE documents
          ADD COLUMN meta_direction VARCHAR(10)
            GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.direction'))) STORED
            AFTER meta_currency
      `);
      await queryRunner.query(`
        ALTER TABLE documents
          ADD KEY idx_doc_meta_direction (taxpayer_id, document_type_id, meta_direction)
      `);
    }

    for (const code of ['e_arsiv_fatura', 'e_fatura']) {
      const rows: Array<{ metadata_schema: string | Record<string, unknown> }> = await queryRunner.query(
        `SELECT metadata_schema FROM document_types WHERE code = ?`,
        [code],
      );
      if (!rows.length) continue;
      // mysql2 JSON kolonlarını otomatik parse eder — hem object hem (farklı sürücü/ortamda) string olabilir.
      const raw = rows[0].metadata_schema;
      const schema = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (schema.fields.some((f: { key: string }) => f.key === 'direction')) continue;

      const dateIdx = schema.fields.findIndex((f: { key: string }) => f.key === 'documentDate');
      const directionField = {
        key: 'direction',
        label: 'Alış/Satış',
        type: 'enum',
        required: true,
        canonical: true,
        options: ['alis', 'satis'],
      };
      schema.fields.splice(dateIdx + 1, 0, directionField);

      await queryRunner.query(`UPDATE document_types SET metadata_schema = ? WHERE code = ?`, [
        JSON.stringify(schema),
        code,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const code of ['e_arsiv_fatura', 'e_fatura']) {
      const rows: Array<{ metadata_schema: string | Record<string, unknown> }> = await queryRunner.query(
        `SELECT metadata_schema FROM document_types WHERE code = ?`,
        [code],
      );
      if (!rows.length) continue;
      const raw = rows[0].metadata_schema;
      const schema = typeof raw === 'string' ? JSON.parse(raw) : raw;
      schema.fields = schema.fields.filter((f: { key: string }) => f.key !== 'direction');
      await queryRunner.query(`UPDATE document_types SET metadata_schema = ? WHERE code = ?`, [
        JSON.stringify(schema),
        code,
      ]);
    }

    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'meta_direction'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE documents DROP KEY idx_doc_meta_direction`);
      await queryRunner.query(`ALTER TABLE documents DROP COLUMN meta_direction`);
    }
  }
}
