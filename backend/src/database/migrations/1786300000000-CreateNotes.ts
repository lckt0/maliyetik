import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kişisel notlar + hatırlatıcı.
 *
 * Notlar önceden yalnızca tarayıcının localStorage'ında duruyordu: başka cihazda
 * görünmüyor, tarayıcı verisi silinince kayboluyor ve hatırlatma kurulamıyordu.
 * Sunucuya taşındı; `remind_at` dolu notlar için zamanlanmış görev bildirim +
 * e-posta gönderir (bkz. NotesService.dispatchDueReminders).
 */
export class CreateNotes1786300000000 implements MigrationInterface {
  name = 'CreateNotes1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notes'`,
    );
    if (Number(existing[0].c) > 0) return;

    await queryRunner.query(`
      CREATE TABLE notes (
          id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          uuid         CHAR(36)        NOT NULL DEFAULT (UUID()),
          user_id      BIGINT UNSIGNED NOT NULL,
          content      TEXT            NOT NULL,
          pinned       TINYINT(1)      NOT NULL DEFAULT 0,
          done_at      DATETIME        NULL,
          remind_at    DATETIME        NULL,
          reminded_at  DATETIME        NULL,
          created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_note_uuid (uuid),
          KEY idx_note_user (user_id, pinned, updated_at),
          -- Zamanlanmış görev yalnızca "vakti gelmiş ve henüz gönderilmemiş" satırları
          -- tarar; bu bileşik indeks o taramayı tablo boyutundan bağımsız kılar.
          KEY idx_note_due (reminded_at, remind_at),
          CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notes`);
  }
}
