import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dışa Aktar → Luca Excel: tek "Satış Hesap Kodu" + tek "Hesaplanan KDV Hesap Kodu" tüm
 * KDV oranlarında (0/10/20) reuse ediliyordu (bkz. AddLucaAccountSettings1785900000000).
 * Kullanıcı, mükellefin hesap planında oran bazında ayrı hesap kodları istediğini belirtti —
 * bu yüzden `luca_satis_hesap_kodu` ve `luca_kdv_hesap_kodu` beş oran-bazlı koda bölünüyor.
 * Bu iki eski kolon yazıldığı sırada hiçbir mükellefte doldurulmamıştı (özellik birkaç gün
 * önce eklenmişti), ama migration başka bir veritabanına/replay'e karşı dayanıklı olsun diye
 * DROP öncesi dolu değerleri oran-bazlı yeni kolonlara taşır.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class SplitLucaVatAccountCodes1786000000000 implements MigrationInterface {
  name = 'SplitLucaVatAccountCodes1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxpayer_profiles' AND COLUMN_NAME = 'luca_kdv0_toplam_hesap_kodu'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE taxpayer_profiles
          ADD COLUMN luca_kdv0_toplam_hesap_kodu       VARCHAR(20) NULL AFTER luca_yemek_karti_hesap_kodu,
          ADD COLUMN luca_kdv10_toplam_hesap_kodu       VARCHAR(20) NULL AFTER luca_kdv0_toplam_hesap_kodu,
          ADD COLUMN luca_kdv10_hesaplanan_hesap_kodu   VARCHAR(20) NULL AFTER luca_kdv10_toplam_hesap_kodu,
          ADD COLUMN luca_kdv20_toplam_hesap_kodu       VARCHAR(20) NULL AFTER luca_kdv10_hesaplanan_hesap_kodu,
          ADD COLUMN luca_kdv20_hesaplanan_hesap_kodu   VARCHAR(20) NULL AFTER luca_kdv20_toplam_hesap_kodu
      `);
    }

    const oldCols: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxpayer_profiles' AND COLUMN_NAME = 'luca_satis_hesap_kodu'`,
    );
    if (Number(oldCols[0].c) > 0) {
      // Eski kolonlar bu migration yazılırken hiçbir mükellefte dolu değildi, ama bu
      // varsayıma körlemesine güvenip DROP etmiyoruz: dolu veri varsa önce oran-bazlı
      // yeni kolonlara taşınır (satış toplamı %20'ye, hesaplanan KDV %20 hesaplanana —
      // özellik eklendiğinde tek oran destekleniyordu), sonra kolonlar düşürülür.
      await queryRunner.query(`
        UPDATE taxpayer_profiles
           SET luca_kdv20_toplam_hesap_kodu = COALESCE(luca_kdv20_toplam_hesap_kodu, luca_satis_hesap_kodu),
               luca_kdv20_hesaplanan_hesap_kodu = COALESCE(luca_kdv20_hesaplanan_hesap_kodu, luca_kdv_hesap_kodu)
         WHERE luca_satis_hesap_kodu IS NOT NULL OR luca_kdv_hesap_kodu IS NOT NULL
      `);
      await queryRunner.query(`
        ALTER TABLE taxpayer_profiles
          DROP COLUMN luca_satis_hesap_kodu,
          DROP COLUMN luca_kdv_hesap_kodu
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const oldCols: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxpayer_profiles' AND COLUMN_NAME = 'luca_satis_hesap_kodu'`,
    );
    if (Number(oldCols[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE taxpayer_profiles
          ADD COLUMN luca_satis_hesap_kodu VARCHAR(20) NULL AFTER luca_yemek_karti_hesap_kodu,
          ADD COLUMN luca_kdv_hesap_kodu   VARCHAR(20) NULL AFTER luca_satis_hesap_kodu
      `);
    }

    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taxpayer_profiles' AND COLUMN_NAME = 'luca_kdv0_toplam_hesap_kodu'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`
        ALTER TABLE taxpayer_profiles
          DROP COLUMN luca_kdv0_toplam_hesap_kodu,
          DROP COLUMN luca_kdv10_toplam_hesap_kodu,
          DROP COLUMN luca_kdv10_hesaplanan_hesap_kodu,
          DROP COLUMN luca_kdv20_toplam_hesap_kodu,
          DROP COLUMN luca_kdv20_hesaplanan_hesap_kodu
      `);
    }
  }
}
