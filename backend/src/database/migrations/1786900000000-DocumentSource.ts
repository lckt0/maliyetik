import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Evrağın hangi yoldan girdiğini tutan kolon.
 *
 * NEDEN: Yükleme akışlarının hepsi (detaylı form, Evrak Kayıt, mobil, mobil tarayıcı,
 * toplu ZIP, Luca içe aktarım, PDF bölme, Mali Hafıza) aynı uca düşüyordu ve evrakta
 * bunu ayırt edecek hiçbir iz kalmıyordu. Sonuç: "mobil uygulama gerçekten kullanıldı
 * mı", "toplu yükleme işe yaradı mı" soruları veritabanından cevaplanamıyordu.
 *
 * Bu bilgi geriye dönük ÜRETİLEMEZ — ölçüm ancak kolon konduktan sonra başlar. Mevcut
 * satırlar bilerek `unknown` kalıyor; onları tahminle doldurmak, olmayan bir veriyi
 * varmış gibi göstermek olurdu.
 *
 * Yalnızca eklemeli migration; varsayılan değerli olduğu için eski backend imajı da
 * bu şemayla sorunsuz çalışır (kolonu hiç yazmaz, varsayılan devreye girer).
 */
export class DocumentSource1786900000000 implements MigrationInterface {
  name = 'DocumentSource1786900000000';

  private async columnMissing(q: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows: Array<{ c: number }> = await q.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column],
    );
    return Number(rows[0].c) === 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await this.columnMissing(q, 'documents', 'source')) {
      await q.query(
        "ALTER TABLE `documents` ADD COLUMN `source` VARCHAR(20) NOT NULL DEFAULT 'unknown' AFTER `status`",
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (!(await this.columnMissing(q, 'documents', 'source'))) {
      await q.query('ALTER TABLE `documents` DROP COLUMN `source`');
    }
  }
}
