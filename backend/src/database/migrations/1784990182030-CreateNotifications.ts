import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kullanıcıya özel bildirimler (zil ikonu) — bkz. NotificationsModule.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class CreateNotifications1784990182030 implements MigrationInterface {
  name = 'CreateNotifications1784990182030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        CREATE TABLE notifications (
            id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id    BIGINT UNSIGNED NOT NULL,
            type       VARCHAR(50)     NOT NULL,
            title      VARCHAR(255)    NOT NULL,
            body       TEXT            NULL,
            metadata   JSON            NULL,
            read_at    DATETIME        NULL,
            created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_notif_user_created (user_id, created_at DESC),
            KEY idx_notif_user_unread  (user_id, read_at),
            CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notifications`);
  }
}
