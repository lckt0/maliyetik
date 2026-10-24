import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin tarafından gönderilen sistem duyuruları — bkz. AnnouncementsModule.
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class CreateAnnouncements1784997204386 implements MigrationInterface {
  name = 'CreateAnnouncements1784997204386';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        CREATE TABLE announcements (
            id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            title             VARCHAR(255)    NOT NULL,
            body              TEXT            NOT NULL,
            created_by_user_id BIGINT UNSIGNED NULL,
            created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_announcements_created (created_at DESC),
            CONSTRAINT fk_announcement_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS announcements`);
  }
}
