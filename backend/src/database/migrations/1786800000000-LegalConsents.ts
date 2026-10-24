import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Yasal metin onaylarının kanıt tablosu.
 *
 * Kayıt formunda kullanım koşulları ve KVKK aydınlatması onaylatılır. Metni göstermek
 * tek başına yetmez — KVKK'da ispat
 * yükü veri sorumlusundadır, onayın ne zaman ve hangi metin sürümü için verildiği
 * gösterilebilmelidir.
 *
 * Onay geri alındığında satır silinmez, `revoked_at` doldurulur: geri alma da
 * ispatlanması gereken bir olaydır ve "hiç onay vermemiş" ile "onayı geri almış"
 * hukuken farklı durumlardır.
 *
 * Yalnızca eklemeli migration (bkz. isletme kılavuzu migration kuralı).
 */
export class LegalConsents1786800000000 implements MigrationInterface {
  name = 'LegalConsents1786800000000';

  private async tableMissing(q: QueryRunner, table: string): Promise<boolean> {
    const rows: Array<{ c: number }> = await q.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [table],
    );
    return Number(rows[0].c) === 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await this.tableMissing(q, 'legal_consents')) {
      await q.query(`
        CREATE TABLE \`legal_consents\` (
          \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          \`user_id\` BIGINT UNSIGNED NOT NULL,
          \`document\` VARCHAR(60) NOT NULL,
          \`version\` VARCHAR(20) NOT NULL,
          \`ip\` VARCHAR(45) NULL,
          \`user_agent\` VARCHAR(255) NULL,
          \`revoked_at\` DATETIME NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          KEY \`idx_legal_consent_user\` (\`user_id\`, \`document\`),
          CONSTRAINT \`fk_legal_consent_user\` FOREIGN KEY (\`user_id\`)
            REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE IF EXISTS `legal_consents`');
  }
}
