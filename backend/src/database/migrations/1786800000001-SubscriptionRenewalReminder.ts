import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Abonelik yenileme hatırlatmalarının "hangi eşik gönderildi" izi.
 *
 * Shopier'de otomatik yenileme YOK: dönem bitince
 * abonelik sessizce past_due'ya düşüyor ve kullanıcı çoğu zaman bunu ancak bir
 * işlem engellendiğinde fark ediyor. 30/7/1 gün kala hatırlatma göndereceğiz.
 *
 * Kolon, gönderilen EN DAR eşiği tutar (30 → 7 → 1). Cron saatte değil günde bir
 * çalışsa bile yeniden gönderim yapmaması buna bakılarak sağlanıyor; ayrıca
 * abonelik yenilendiğinde NULL'a çekilir ve yeni dönem için baştan başlar.
 *
 * Yalnızca eklemeli migration.
 */
export class SubscriptionRenewalReminder1786800000001 implements MigrationInterface {
  name = 'SubscriptionRenewalReminder1786800000001';

  private async columnMissing(q: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows: Array<{ c: number }> = await q.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column],
    );
    return Number(rows[0].c) === 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await this.columnMissing(q, 'subscriptions', 'renewal_reminder_days')) {
      await q.query(
        'ALTER TABLE `subscriptions` ADD COLUMN `renewal_reminder_days` INT NULL AFTER `cancel_at_period_end`',
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (!(await this.columnMissing(q, 'subscriptions', 'renewal_reminder_days'))) {
      await q.query('ALTER TABLE `subscriptions` DROP COLUMN `renewal_reminder_days`');
    }
  }
}
