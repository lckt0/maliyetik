import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Koltuk modeli + arşiv modu.
 *
 * SORUN: müşavir planında evrak kotası yoktu, mükellef planında vardı. Bir müşavir
 * Ofis M alsa bile 30 mükellefinin HER BİRİ ayrıca abone olmadıkça sistemi
 * kullanamıyordu — ürünü bir kez kullanmak için otuz bir kez satmak gerekiyordu.
 *
 * ÇÖZÜM: müşavir "koltuk" satın alır; her koltuk bir mükellefe evrak tavanı taşır.
 * Mükellef hiçbir şey ödemez. Kendi ücretli planı olan mükellef koltuk tüketmez —
 * bir mükellef için sistemde tek ödeme yapılır.
 *
 * KOTA TAVANI ARTIK ÜÇ KAYNAKTAN HESAPLANIR:
 *     quota_limit = quota_purchased + MAX(quota_from_plan, quota_from_accountant)
 *
 *  1) `quota_purchased` AYRI KOLONA ALINDI. Önceden "satın alınan" pay
 *     `quota_limit - quota_from_plan` ile TÜRETİLİYORDU ve bu sessizce yanlıştı:
 *     tavan `quota_used`'a kırpıldığı anda türetme bozuluyor, kırpılan fark kalıcı
 *     olarak "satın alınmış" sayılıyordu. Örnek: plan 6000, kullanılan 5000, satın
 *     alınan 0 iken plan 200'e düşürülünce tavan 5000'de kırpılıyor, satın alınan
 *     4800 görünüyordu; plan geri yükseltilince tavan 10.800'e fırlıyordu. Kolon
 *     artık açıkça tutuluyor, türetilmiyor.
 *
 *  2) TAVAN ARTIK `quota_used`'A KIRPILMIYOR. Kırpma, silinen evrakla birlikte
 *     bedava kota doğuruyordu (yukarıdaki örnekte 4000 evrak silinince 4000 hak
 *     ortaya çıkıyordu). Bunun yerine `used > limit` MEŞRU BİR DURUM: yükleme
 *     durur, hiçbir evrak silinmez, görüntüleme/indirme/dışa aktarma açık kalır.
 *     Ürün tarafında bunun adı ARŞİV MODU'dur.
 *
 * ARŞİV MODU ÜCRETSİZDİR. Evrak yüklenirken 10 yıllık saklama maliyeti (₺0,032)
 * zaten gider yazıldığı için ayrılan mükellefin arşivini tutmanın marjinal maliyeti
 * yok denecek kadar azdır (5.000 evrak = yılda ₺16). Karşılığında "ayrılırsanız
 * evraklarınız sizde kalır" güvencesi, müşavir değiştirmenin önündeki en büyük
 * engeli kaldırır.
 */
export class AccountantSeatsAndArchive1786700000000 implements MigrationInterface {
  name = 'AccountantSeatsAndArchive1786700000000';

  private async columnMissing(q: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows: Array<{ c: number }> = await q.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column],
    );
    return Number(rows[0].c) === 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await this.columnMissing(q, 'taxpayer_profiles', 'quota_purchased')) {
      await q.query(`
        ALTER TABLE taxpayer_profiles
          ADD COLUMN quota_purchased BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER quota_from_plan
      `);
      // Geçmiş veri: bugüne kadar geçerli olan türetmeyle doldurulur. Kırpılmış
      // kayıtlarda bu değer olduğundan büyük çıkabilir; mükellefin ALEYHİNE bir
      // düzeltme yapmamak için olduğu gibi bırakılıyor (tavan asla düşürülmez).
      await q.query(`
        UPDATE taxpayer_profiles
           SET quota_purchased = GREATEST(CAST(quota_limit AS SIGNED) - CAST(quota_from_plan AS SIGNED), 0)
      `);
    }

    if (await this.columnMissing(q, 'taxpayer_profiles', 'quota_from_accountant')) {
      await q.query(`
        ALTER TABLE taxpayer_profiles
          ADD COLUMN quota_from_accountant BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER quota_purchased
      `);
    }

    // Müşavir planlarında: bir koltuğun (mükellefin) evrak tavanı.
    if (await this.columnMissing(q, 'subscription_plans', 'quota_per_seat')) {
      await q.query(`
        ALTER TABLE subscription_plans
          ADD COLUMN quota_per_seat BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER included_quota
      `);
    }

    // Fiyatlar yıllık ve KDV hariç.
    // code, name, description, priceYearly, includedQuota, quotaPerSeat, aiCredits, maxTaxpayers, features
    const plans: Array<[string, string, string, number, number, number, number, number, string]> = [
      ['mukellef_ucretsiz', 'Ücretsiz', 'Müşaviriyle çalışan mükellefler için başlangıç kademesi',
        0, 200, 0, 20, 0,
        '["200 evrak saklama","20 AI dijitalleştirme","Mobil uygulama ve kamerayla tarama","Bir mali müşavire yetki"]'],
      ['mukellef_baslangic', 'Başlangıç', 'Müşavirsiz çalışan tek şirket',
        990, 1500, 0, 100, 0,
        '["1.500 evrak saklama","100 AI dijitalleştirme","Yapay zeka deneyimi","Toplu ve mobil yükleme","E-posta destek"]'],
      ['mukellef_standart', 'Standart', 'Düzenli evrak akışı olan işletmeler',
        1990, 6000, 0, 400, 0,
        '["6.000 evrak saklama","400 AI dijitalleştirme","Yapay zeka deneyimi","Çoklu fatura PDF ayırma","Öncelikli destek"]'],
      ['mukellef_pro', 'Profesyonel', 'Yoğun evrak akışı olan işletmeler',
        3990, 20000, 0, 1200, 0,
        '["20.000 evrak saklama","1.200 AI dijitalleştirme","Yapay zeka deneyimi","Tüm evrak türleri","Telefon destek"]'],
      ['musavir_ofis_s', 'Ofis S', '10 mükellef — mükellefleriniz ücret ödemez',
        4990, 0, 1500, 1000, 10,
        '["10 mükellef koltuğu","Mükellef başına 1.500 evrak","Luca içe/dışa aktarım","1.000 AI dijitalleştirme","Yapay zeka deneyimi"]'],
      ['musavir_ofis_m', 'Ofis M', '30 mükellef — mükellefleriniz ücret ödemez',
        11900, 0, 1500, 3000, 30,
        '["30 mükellef koltuğu","Mükellef başına 1.500 evrak","Luca içe/dışa aktarım","3.000 AI dijitalleştirme","Mükellefe bildirim gönderme"]'],
      ['musavir_ofis_l', 'Ofis L', '75 mükellef — mükellefleriniz ücret ödemez',
        24900, 0, 1500, 7500, 75,
        '["75 mükellef koltuğu","Mükellef başına 1.500 evrak","Luca içe/dışa aktarım","7.500 AI dijitalleştirme","Öncelikli destek"]'],
    ];

    for (const [index, plan] of plans.entries()) {
      const [code, name, description, price, quota, perSeat, ai, seats, features] = plan;
      const sortOrder = (index + 1) * 10;
      const existing: Array<{ c: number }> = await q.query(
        'SELECT COUNT(*) AS c FROM subscription_plans WHERE code = ?', [code],
      );
      if (Number(existing[0].c) === 0) {
        await q.query(
          `INSERT INTO subscription_plans
             (code, name, description, audience, price_monthly, price_yearly, included_quota,
              quota_per_seat, included_ai_credits, max_taxpayers, trial_days, sort_order, features)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 14, ?, CAST(? AS JSON))`,
          [code, name, description, code.startsWith('musavir') ? 'accountant' : 'taxpayer',
            price, quota, perSeat, ai, seats, sortOrder, features],
        );
      } else {
        await q.query(
          `UPDATE subscription_plans SET
             name = ?, description = ?, price_monthly = 0, price_yearly = ?,
             included_quota = ?, quota_per_seat = ?, included_ai_credits = ?,
             max_taxpayers = ?, sort_order = ?, features = CAST(? AS JSON)
           WHERE code = ?`,
          [name, description, price, quota, perSeat, ai, seats, sortOrder, features, code],
        );
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE subscription_plans DROP COLUMN quota_per_seat');
    await q.query('ALTER TABLE taxpayer_profiles DROP COLUMN quota_from_accountant');
    await q.query('ALTER TABLE taxpayer_profiles DROP COLUMN quota_purchased');
  }
}
