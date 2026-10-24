import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Z-Raporu evrak türünü yeniden tanımlar: Z no, tarih, tutar kırılımları
 * (kredi kartı/nakit/yemek kartı, %0-%10-%20 KDV satış+vergi) ve gruplama için
 * `receiptGroupNo` kanonik alanı. Aynı Fiş Grup No'lu Z-Raporları evrak
 * listesinde tek satır olarak gösterebilmek için `meta_receipt_group_no`
 * generated STORED kolonu + indeksi eklenir (bkz. AddInvoiceDirection deseni).
 * schema.sql / seed.sql ile birebir senkron (bkz. docker/mysql/init).
 */
export class AddZRaporuFields1784940510488 implements MigrationInterface {
  name = 'AddZRaporuFields1784940510488';

  private readonly NEW_SCHEMA = {
    fileAccept: 'image/*',
    groupField: 'receiptGroupNo',
    fields: [
      { key: 'documentNo', label: 'Z No', type: 'string', required: true, canonical: true },
      { key: 'documentDate', label: 'Tarih', type: 'date', required: true },
      { key: 'receiptGroupNo', label: 'Fiş Grup No', type: 'string', required: false, canonical: true },
      { key: 'totalAmount', label: 'Toplam Tutar', type: 'decimal', required: true, canonical: true },
      { key: 'creditCardAmount', label: 'Kredi Kartı Toplam Tutar', type: 'decimal', required: false },
      { key: 'cashAmount', label: 'Nakit Toplam Tutar', type: 'decimal', required: false },
      { key: 'mealCardAmount', label: 'Yemek Kartları Toplam Tutar', type: 'decimal', required: false },
      { key: 'vat0SalesAmount', label: '%0 KDV Satış Toplamı', type: 'decimal', required: false },
      { key: 'vat10SalesAmount', label: '%10 KDV Satış Toplamı', type: 'decimal', required: false },
      { key: 'vat10TaxAmount', label: '%10 KDV Toplam KDV', type: 'decimal', required: false },
      { key: 'vat20SalesAmount', label: '%20 KDV Satış Toplamı', type: 'decimal', required: false },
      { key: 'vat20TaxAmount', label: '%20 KDV Toplam KDV', type: 'decimal', required: false },
    ],
  };

  private readonly OLD_SCHEMA = {
    fields: [
      { key: 'documentNo', label: 'Z No', type: 'string', required: true, canonical: true },
      { key: 'documentDate', label: 'Tarih', type: 'date', required: true },
      { key: 'receiptRangeStart', label: 'Fiş No Başlangıç', type: 'string', required: false },
      { key: 'receiptRangeEnd', label: 'Fiş No Bitiş', type: 'string', required: false },
      { key: 'totalAmount', label: 'Toplam Satış Tutarı', type: 'decimal', required: true, canonical: true },
      { key: 'taxAmount', label: 'KDV Tutarı', type: 'decimal', required: false, canonical: true },
      { key: 'taxBreakdown', label: 'KDV Kırılımı', type: 'json', required: false },
    ],
  };

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'meta_receipt_group_no'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE documents
          ADD COLUMN meta_receipt_group_no VARCHAR(50)
            GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.receiptGroupNo'))) STORED
            AFTER meta_direction
      `);
      await queryRunner.query(`
        ALTER TABLE documents
          ADD KEY idx_doc_meta_receipt_group (taxpayer_id, document_type_id, meta_receipt_group_no)
      `);
    }

    await queryRunner.query(`UPDATE document_types SET metadata_schema = ? WHERE code = 'z_raporu'`, [
      JSON.stringify(this.NEW_SCHEMA),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE document_types SET metadata_schema = ? WHERE code = 'z_raporu'`, [
      JSON.stringify(this.OLD_SCHEMA),
    ]);

    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'documents' AND COLUMN_NAME = 'meta_receipt_group_no'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE documents DROP KEY idx_doc_meta_receipt_group`);
      await queryRunner.query(`ALTER TABLE documents DROP COLUMN meta_receipt_group_no`);
    }
  }
}
