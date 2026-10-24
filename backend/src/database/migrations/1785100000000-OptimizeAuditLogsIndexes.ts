import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `audit_logs`: keyset sayfalama `id DESC` ile yapılır ama mevcut composite indeksler
 * trailing kolon olarak `created_at` kullanıyordu — MySQL filtreyi indeksle karşılasa
 * bile `ORDER BY id DESC` için ayrıca filesort yapıyordu. `id` her zaman `created_at`
 * ile aynı sırada arttığından (auto-increment, append-only), trailing kolonu `id`
 * yapmak filtre + sıralamayı TEK indeks taramasında karşılar. Ayrıca `action` filtresi
 * için hiç indeks yoktu — eklendi.
 */
export class OptimizeAuditLogsIndexes1785100000000 implements MigrationInterface {
  name = 'OptimizeAuditLogsIndexes1785100000000';

  private async indexExists(queryRunner: QueryRunner, name: string): Promise<boolean> {
    const rows: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs' AND INDEX_NAME = ?`,
      [name],
    );
    return Number(rows[0].c) > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await this.indexExists(queryRunner, 'idx_audit_actor')) {
      await queryRunner.query(`ALTER TABLE audit_logs DROP INDEX idx_audit_actor`);
    }
    await queryRunner.query(`ALTER TABLE audit_logs ADD INDEX idx_audit_actor (actor_user_id, id)`);

    if (await this.indexExists(queryRunner, 'idx_audit_taxpayer')) {
      await queryRunner.query(`ALTER TABLE audit_logs DROP INDEX idx_audit_taxpayer`);
    }
    await queryRunner.query(`ALTER TABLE audit_logs ADD INDEX idx_audit_taxpayer (taxpayer_id, id)`);

    if (!(await this.indexExists(queryRunner, 'idx_audit_action'))) {
      await queryRunner.query(`ALTER TABLE audit_logs ADD INDEX idx_audit_action (action, id)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.indexExists(queryRunner, 'idx_audit_action')) {
      await queryRunner.query(`ALTER TABLE audit_logs DROP INDEX idx_audit_action`);
    }
    if (await this.indexExists(queryRunner, 'idx_audit_actor')) {
      await queryRunner.query(`ALTER TABLE audit_logs DROP INDEX idx_audit_actor`);
    }
    await queryRunner.query(`ALTER TABLE audit_logs ADD INDEX idx_audit_actor (actor_user_id, created_at DESC)`);

    if (await this.indexExists(queryRunner, 'idx_audit_taxpayer')) {
      await queryRunner.query(`ALTER TABLE audit_logs DROP INDEX idx_audit_taxpayer`);
    }
    await queryRunner.query(`ALTER TABLE audit_logs ADD INDEX idx_audit_taxpayer (taxpayer_id, created_at DESC)`);
  }
}
