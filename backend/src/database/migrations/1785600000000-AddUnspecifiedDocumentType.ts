import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Evrak yüklerken tür seçimi artık zorunlu değil (bkz. UploadDocumentDto.documentTypeId).
 * Tür belirtilmeden yüklenen evraklar bu türe düşer — mevcut "Diğer" (diger) türünden
 * kasıtlı olarak ayrı: biri kullanıcının bilerek seçtiği "diğer", öteki hiç seçim
 * yapılmadığı anlamına gelir. schema.sql/seed.sql ile birebir senkron.
 */
export class AddUnspecifiedDocumentType1785600000000 implements MigrationInterface {
  name = 'AddUnspecifiedDocumentType1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM document_types WHERE code = 'belirtilmedi'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        INSERT INTO document_types (code, name, category, sort_order, metadata_schema) VALUES
        ('belirtilmedi', 'Belirtilmedi', 'other', 131, CAST('{"fields":[
            {"key":"documentName","label":"Belge Adı","type":"string","required":false},
            {"key":"documentDate","label":"Belge Tarihi","type":"date","required":false}
        ]}' AS JSON))
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM document_types WHERE code = 'belirtilmedi'`);
  }
}
