import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kullanıcı profili: herkese açık sayfa (<site>/u/:username) için
 * `username`, zengin metin biyografi için `bio`, profil fotoğrafı için
 * `avatar_path` (GCS yolu) ve görünürlük anahtarı `is_public`.
 * Var olan kullanıcılara e-posta yerel kısmından türetilmiş benzersiz bir
 * `username` atanır (kullanıcı sonradan Hesap sayfasından değiştirebilir).
 * schema.sql ile birebir senkron (bkz. docker/mysql/init/01_schema.sql).
 */
export class AddUserProfileFields1784966329941 implements MigrationInterface {
  name = 'AddUserProfileFields1784966329941';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'`,
    );
    if (Number(existing[0].c) === 0) {
      await queryRunner.query(`
        ALTER TABLE users
          ADD COLUMN username    VARCHAR(30)  NULL AFTER status,
          ADD COLUMN bio         TEXT         NULL AFTER username,
          ADD COLUMN avatar_path VARCHAR(500) NULL AFTER bio,
          ADD COLUMN is_public   TINYINT(1)   NOT NULL DEFAULT 0 AFTER avatar_path
      `);
    }

    const rows: Array<{ id: string; email: string }> = await queryRunner.query(
      `SELECT id, email FROM users WHERE username IS NULL`,
    );
    if (rows.length) {
      const taken = new Set(
        (await queryRunner.query(`SELECT username FROM users WHERE username IS NOT NULL`)).map(
          (r: { username: string }) => r.username,
        ),
      );
      for (const row of rows) {
        const base = row.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]+/g, '').slice(0, 24) || 'kullanici';
        let candidate = base;
        let suffix = 1;
        while (taken.has(candidate)) {
          candidate = `${base}${suffix}`.slice(0, 30);
          suffix += 1;
        }
        taken.add(candidate);
        await queryRunner.query(`UPDATE users SET username = ? WHERE id = ?`, [candidate, row.id]);
      }
    }

    const uniqueExists: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'uq_users_username'`,
    );
    if (Number(uniqueExists[0].c) === 0) {
      await queryRunner.query(`ALTER TABLE users ADD UNIQUE KEY uq_users_username (username)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'`,
    );
    if (Number(existing[0].c) > 0) {
      await queryRunner.query(`ALTER TABLE users DROP KEY uq_users_username`);
      await queryRunner.query(`ALTER TABLE users DROP COLUMN username, DROP COLUMN bio, DROP COLUMN avatar_path, DROP COLUMN is_public`);
    }
  }
}
