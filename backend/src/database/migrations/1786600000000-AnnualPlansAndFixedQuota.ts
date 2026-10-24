import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ticari modelin yeniden kurulması:
 *
 *  1) TÜM PLANLAR YILLIK. Aylık faturalama kaldırıldı; `price_monthly` yalnızca eski
 *     kayıtlar için duruyor ve 0'a çekildi. Satın alma akışı yalnızca yıllık dönem kabul eder.
 *
 *  2) EVRAK KOTASI SABİT TAVAN, BİRİKMEZ. Kota bu sistemde bir AKIŞ değil STOK'tur:
 *     `quota_used` o an DURAN evrak sayısıdır, kalıcı silme iade eder. Dolayısıyla doğru
 *     davranış "her dönem X hak ekle" değil, "tavanı X yap"tır. Önceki kod her yenilemede
 *     tavanı artırıyordu; bir yıl sonra aynı planın tavanı iki katına çıkıyordu.
 *     Bunun için `quota_from_plan` eklendi: tavanın plandan gelen kısmı ayrı tutulur,
 *     satın alınan ek paketler bunun ÜSTÜNE kalıcı olarak eklenir. Plan değişiminde
 *     yalnızca aradaki fark uygulanır; aynı planın yenilenmesi tavanı değiştirmez.
 *
 *  3) MÜŞAVİR PLANLARI EVRAK KOTASI İÇERMEZ. Müşavirin kendi mükellef profili yoktur;
 *     plandaki kota bugüne kadar hiçbir yere yazılmıyordu (sessiz bir yalan). Müşavir
 *     planı artık erişim + mükellef sayısı + AI kredisi satar; müşavir dilerse mükellefi
 *     adına ek kota paketi alabilir (bu akış zaten var).
 *
 *  4) ÜCRETSİZ MÜKELLEF KADEMESİ eklendi — müşavirin mükellefini sürtünmesiz sisteme
 *     alabilmesi için.
 */
export class AnnualPlansAndFixedQuota1786600000000 implements MigrationInterface {
  name = 'AnnualPlansAndFixedQuota1786600000000';

  private async columnMissing(q: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows: Array<{ c: number }> = await q.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column],
    );
    return Number(rows[0].c) === 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await this.columnMissing(q, 'taxpayer_profiles', 'quota_from_plan')) {
      await q.query(`
        ALTER TABLE taxpayer_profiles
          ADD COLUMN quota_from_plan BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER quota_limit
      `);
    }

    // Fiyatlar yıllık ve KDV hariç. İçerikler "sabit tavan" modeline göre yeniden
    // ölçeklendi: mükellef planındaki evrak sayısı artık aylık hak değil, toplam
    // saklama tavanıdır — bu yüzden eski aylık rakamların yıllık karşılığına yakın tutuldu.
    const plans: Array<[string, string, string, number, number, number, number, string]> = [
      // code, name, description, priceYearly, includedQuota, includedAiCredits, maxTaxpayers, features
      ['mukellef_ucretsiz', 'Ücretsiz', 'Müşaviriyle çalışan mükellefler için başlangıç kademesi',
        0, 200, 20, 0,
        '["200 evrak saklama","20 AI dijitalleştirme","Mobil uygulama ve kamerayla tarama","Bir mali müşavire yetki"]'],
      ['mukellef_baslangic', 'Başlangıç', 'Tek şirket, temel evrak yönetimi',
        2490, 1500, 100, 0,
        '["1.500 evrak saklama","100 AI dijitalleştirme","Yapay zeka deneyimi","Toplu ve mobil yükleme","E-posta destek"]'],
      ['mukellef_standart', 'Standart', 'Düzenli evrak akışı olan işletmeler',
        4990, 6000, 400, 0,
        '["6.000 evrak saklama","400 AI dijitalleştirme","Yapay zeka deneyimi","Çoklu fatura PDF ayırma","Öncelikli destek"]'],
      ['mukellef_pro', 'Profesyonel', 'Yoğun evrak akışı olan işletmeler',
        9990, 20000, 1200, 0,
        '["20.000 evrak saklama","1.200 AI dijitalleştirme","Yapay zeka deneyimi","Tüm evrak türleri","Telefon destek"]'],
      ['musavir_ofis_s', 'Ofis S', '10 mükellefe kadar',
        9990, 0, 600, 10,
        '["10 mükellef","Luca içe/dışa aktarım","600 AI dijitalleştirme","Yapay zeka deneyimi","Mükellef panosu"]'],
      ['musavir_ofis_m', 'Ofis M', '30 mükellefe kadar',
        19900, 0, 2000, 30,
        '["30 mükellef","Luca içe/dışa aktarım","2.000 AI dijitalleştirme","Yapay zeka deneyimi","Mükellefe bildirim gönderme"]'],
      ['musavir_ofis_l', 'Ofis L', 'Sınırsız mükellef',
        49900, 0, 6000, 0,
        '["Sınırsız mükellef","Luca içe/dışa aktarım","6.000 AI dijitalleştirme","Yapay zeka deneyimi","Öncelikli destek"]'],
    ];

    for (const [index, plan] of plans.entries()) {
      const [code, name, description, priceYearly, quota, ai, maxTaxpayers, features] = plan;
      const sortOrder = (index + 1) * 10;
      const existing: Array<{ c: number }> = await q.query(
        'SELECT COUNT(*) AS c FROM subscription_plans WHERE code = ?', [code],
      );
      if (Number(existing[0].c) === 0) {
        await q.query(
          `INSERT INTO subscription_plans
             (code, name, description, audience, price_monthly, price_yearly, included_quota,
              included_ai_credits, max_taxpayers, trial_days, sort_order, features)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, 14, ?, CAST(? AS JSON))`,
          [code, name, description, code.startsWith('musavir') ? 'accountant' : 'taxpayer',
            priceYearly, quota, ai, maxTaxpayers, sortOrder, features],
        );
      } else {
        await q.query(
          `UPDATE subscription_plans SET
             name = ?, description = ?, price_monthly = 0, price_yearly = ?,
             included_quota = ?, included_ai_credits = ?, max_taxpayers = ?,
             sort_order = ?, features = CAST(? AS JSON)
           WHERE code = ?`,
          [name, description, priceYearly, quota, ai, maxTaxpayers, sortOrder, features, code],
        );
      }
    }

    // Yürürlükteki abonelikler yıllık döneme çekilir (aylık faturalama artık yok).
    await q.query(`UPDATE subscriptions SET billing_period = 'yearly' WHERE billing_period = 'monthly'`);

    // Mevcut mükelleflerin tavanının plandan gelen kısmı bilinmiyor; hepsi "satın alınmış"
    // kabul edilir (quota_from_plan = 0). Böylece bir sonraki plan atamasında mevcut
    // tavanları AZALTILMAZ, yalnızca plan payı üstüne eklenir.
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE taxpayer_profiles DROP COLUMN quota_from_plan');
  }
}
