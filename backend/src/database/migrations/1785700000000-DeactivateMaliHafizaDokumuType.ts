import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Mali Hafıza Dökümü" (code: mali_hafiza) genel evrak türü — Evrak Kayıt/Detaylı Yükleme
 * tür seçim listesinde "Mali Hafıza Raporu" (yeni, gömülü Z-Raporu-grubu içe aktarma
 * özelliği) ile isim benzerliğinden dolayı kullanıcılar tarafından yanlışlıkla seçiliyor —
 * bu türle kaydedilen bir evrak tek düz kayıt olarak kalır, asla Z-Raporu grubuna
 * dönüşmez (iki ayrı olayda aynı hataya yol açtı). Tür artık listelerden gizlenir
 * (`is_active=0`) ki bu karışıklık tekrar yaşanmasın; var olan kayıtlar etkilenmez.
 */
export class DeactivateMaliHafizaDokumuType1785700000000 implements MigrationInterface {
  name = 'DeactivateMaliHafizaDokumuType1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE document_types SET is_active = 0 WHERE code = 'mali_hafiza'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE document_types SET is_active = 1 WHERE code = 'mali_hafiza'`);
  }
}
