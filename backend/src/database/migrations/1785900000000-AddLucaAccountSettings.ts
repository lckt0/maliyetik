import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dışa Aktar → "Z-Raporu → Luca Excel" için mükellef başına muhasebe hesap kodları.
 * Her mükellefin hesap planı farklı olabileceğinden (mali müşavir birden fazla mükellefe
 * bakabilir) bu kodlar taxpayer_profiles üzerinde tutulur — accountant_can_view_quota gibi
 * "birkaç ek alan" ihtiyacı için var olan kolon-ekleme deseni izlenir, ayrı tablo açılmaz.
 * Tümü opsiyonel: doldurulmadan da mükellef kullanılabilir, yalnızca dışa aktarımda o hesap
 * gerekince (tutar > 0) uyarı verilir.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class AddLucaAccountSettings1785900000000 implements MigrationInterface {
  name = 'AddLucaAccountSettings1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxpayer_profiles' AND COLUMN_NAME = 'luca_kasa_hesap_kodu'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE taxpayer_profiles
          ADD COLUMN luca_kasa_hesap_kodu         VARCHAR(20) NULL AFTER accountant_can_view_ai_credits,
          ADD COLUMN luca_kredi_karti_hesap_kodu   VARCHAR(20) NULL AFTER luca_kasa_hesap_kodu,
          ADD COLUMN luca_yemek_karti_hesap_kodu   VARCHAR(20) NULL AFTER luca_kredi_karti_hesap_kodu,
          ADD COLUMN luca_satis_hesap_kodu         VARCHAR(20) NULL AFTER luca_yemek_karti_hesap_kodu,
          ADD COLUMN luca_kdv_hesap_kodu           VARCHAR(20) NULL AFTER luca_satis_hesap_kodu,
          ADD COLUMN luca_belge_turu               VARCHAR(20) NULL AFTER luca_kdv_hesap_kodu
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxpayer_profiles' AND COLUMN_NAME = 'luca_kasa_hesap_kodu'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`
        ALTER TABLE taxpayer_profiles
          DROP COLUMN luca_kasa_hesap_kodu,
          DROP COLUMN luca_kredi_karti_hesap_kodu,
          DROP COLUMN luca_yemek_karti_hesap_kodu,
          DROP COLUMN luca_satis_hesap_kodu,
          DROP COLUMN luca_kdv_hesap_kodu,
          DROP COLUMN luca_belge_turu
      `);
    }
  }
}
