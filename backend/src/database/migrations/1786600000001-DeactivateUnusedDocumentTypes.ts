import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kullanılmayan evrak türlerini listelerden kaldırır; tür seçimi sadeleşir.
 * Kaldırılanların ortak yanı,
 * Maliyetik'in işiyle örtüşmemeleri:
 *   - E-Bordro   : personel bazlı bordro, evrak arşivinden çok bordro programının işi
 *   - Sigorta    : "Belge Türü" serbest metin; pratikte "Diğer"den ayrışmıyor
 *   - E-Defter   : dosyalar zaten GİB'de saklanıyor, buradaki kopyanın değeri tartışmalı
 *
 * Tür SİLİNMEZ, yalnızca `is_active = 0` yapılır: kayıt varsa erişilebilir kalır ve
 * talep gelirse tek satırla geri açılır. Güvenlik için yalnızca HİÇ KAYDI OLMAYAN
 * türler pasife alınır — beklenmedik bir ortamda veri varsa tür açık kalır.
 */
export class DeactivateUnusedDocumentTypes1786600000001 implements MigrationInterface {
  name = 'DeactivateUnusedDocumentTypes1786600000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      UPDATE document_types dt
      SET dt.is_active = 0
      WHERE dt.code IN ('e_bordro', 'sigorta', 'e_defter')
        AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.document_type_id = dt.id)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE document_types SET is_active = 1 WHERE code IN ('e_bordro', 'sigorta', 'e_defter')`);
  }
}
