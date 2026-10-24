import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Mali Hafıza Raporu" — Evrak Kayıt'tan yüklenip Evrak Dijitalleştir'de işlenen fotoğraf
 * için TAŞIYICI evrak türü. Kendi metadata alanı yok (fields boş) — dijitalleştirme,
 * standart tek-evrak alan formu yerine özel bir akışla yapılır (bkz. `MaliHafizaJobService`):
 * fotoğraf Gemini ile analiz edilir, kullanıcı her şerit için KDV oranı/ödeme türü seçip
 * onaylar, N adet z_raporu kaydı + TAZE fiş grupları oluşur; bu taşıyıcı evrak da o zaman
 * `isDigitized:true` olarak özet bilgiyle tamamlanır (asıl veri z_raporu kayıtlarındadır).
 */
export class AddMaliHafizaRaporuType1785800000000 implements MigrationInterface {
  name = 'AddMaliHafizaRaporuType1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO document_types (code, name, category, sort_order, metadata_schema)
       VALUES (?, ?, 'financial', 41, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE name = VALUES(name), metadata_schema = VALUES(metadata_schema), is_active = 1`,
      ['mali_hafiza_raporu', 'Mali Hafıza Raporu', JSON.stringify({ fileAccept: 'image/*', fields: [] })],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM document_types WHERE code = 'mali_hafiza_raporu'`);
  }
}
