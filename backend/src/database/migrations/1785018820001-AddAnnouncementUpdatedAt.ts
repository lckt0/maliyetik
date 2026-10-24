import { MigrationInterface, QueryRunner } from 'typeorm';

/** `announcements` düzenlenebilir/silinebilir hale geldi — updated_at eklendi. */
export class AddAnnouncementUpdatedAt1785018820001 implements MigrationInterface {
  name = 'AddAnnouncementUpdatedAt1785018820001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'announcements' AND COLUMN_NAME = 'updated_at'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE announcements
          ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE announcements DROP COLUMN IF EXISTS updated_at`);
  }
}
