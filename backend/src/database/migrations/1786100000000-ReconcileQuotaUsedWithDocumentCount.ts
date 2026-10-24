import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `taxpayer_profiles.quota_used` sayacını mükellefin gerçekten DURAN evrak sayısıyla
 * uzlaştırır: aktif evraklar + çöp kutusundakiler (şirket evrakları hariç — onlar
 * yüklenirken kota tüketmiyor).
 *
 * Neden gerekli: kalıcı silme bugüne kadar kotayı iade etmiyordu, yani çöp kutusundan
 * kalıcı silinen her evrak sayaçta sonsuza dek "kullanılmış" olarak kalıyordu. Kalıcı
 * silmeye iade eklendi (bkz. QuotaService.refund + DocumentsService.purge/bulkPurge/
 * emptyTrash); bu migration da geçmişte oluşmuş birikmiş sapmayı tek seferde düzeltir.
 *
 * Düzeltme çift yönlüdür (sayaç gerçek sayının altındaysa da eşitlenir), böylece
 * "kota = duran evrak sayısı" kuralı istisnasız geçerli olur. Pratikte sapmanın
 * yalnızca fazla-sayım yönünde olması beklenir: evrak oluşturma ile `consume` aynı
 * transaction'da yürüdüğü için kotasız evrak doğması mümkün değil.
 *
 * Her düzeltme `quota_ledger`'a `adjustment` olarak yazılır — mükellef, Kota sayfasındaki
 * hareket dökümünde bakiyesinin neden değiştiğini görebilir.
 */
export class ReconcileQuotaUsedWithDocumentCount1786100000000 implements MigrationInterface {
  name = 'ReconcileQuotaUsedWithDocumentCount1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `documents` tablosundaki HER satır sayılır: `status='deleted'` (çöp kutusu) olanlar
    // da mükellefin sisteminde durmaya devam ediyor ve geri yüklenebiliyor.
    const drifted: Array<{ taxpayerId: string; quotaLimit: string; quotaUsed: string; actual: string }> =
      await queryRunner.query(`
        SELECT t.id                            AS taxpayerId,
               CAST(t.quota_limit AS SIGNED)   AS quotaLimit,
               CAST(t.quota_used  AS SIGNED)   AS quotaUsed,
               COALESCE(c.cnt, 0)              AS actual
        FROM taxpayer_profiles t
        LEFT JOIN (
          SELECT d.taxpayer_id AS tid, COUNT(*) AS cnt
          FROM documents d
          JOIN document_types dt ON dt.id = d.document_type_id
          WHERE dt.category <> 'company'
          GROUP BY d.taxpayer_id
        ) c ON c.tid = t.id
        WHERE CAST(t.quota_used AS SIGNED) <> COALESCE(c.cnt, 0)
      `);

    if (!drifted.length) {
      console.log('[kota-uzlaştırma] Sapma yok, düzeltilecek mükellef bulunmadı.');
      return;
    }

    for (const row of drifted) {
      const used = Number(row.quotaUsed);
      const actual = Number(row.actual);
      const limit = Number(row.quotaLimit);
      // + = iade (sayaç fazlaymış), - = ek tüketim (sayaç eksikmiş)
      const changeAmount = used - actual;

      await queryRunner.query('UPDATE taxpayer_profiles SET quota_used = ? WHERE id = ?', [actual, row.taxpayerId]);
      await queryRunner.query(
        `INSERT INTO quota_ledger (taxpayer_id, change_amount, balance_after, reason, note)
         VALUES (?, ?, ?, 'adjustment', ?)`,
        [row.taxpayerId, changeAmount, limit - actual, `Kota, duran evrak sayısıyla uzlaştırıldı (${used} → ${actual})`],
      );

      console.log(
        `[kota-uzlaştırma] mükellef ${row.taxpayerId}: quota_used ${used} → ${actual} ` +
        `(${changeAmount > 0 ? '+' : ''}${changeAmount})`,
      );
    }

    console.log(`[kota-uzlaştırma] ${drifted.length} mükellefin kotası düzeltildi.`);
  }

  public async down(): Promise<void> {
    // Geri alınamaz: düzeltme öncesi sayaç değerleri yalnızca `quota_ledger`'daki
    // `adjustment` satırlarında duruyor. Geri almak gerekirse o satırlardaki
    // change_amount değerleri quota_used'a tekrar eklenmeli — otomatik yapmak,
    // aradan geçen gerçek yükleme/silmeleri bozacağı için bilinçli olarak elde bırakıldı.
  }
}
