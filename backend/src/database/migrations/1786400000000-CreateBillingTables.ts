import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Abonelik + ek kota satışı altyapısı (sanal POS entegrasyonu HENÜZ YOK).
 *
 * Gelir modeli: mükellef ve mali müşavir için ayrı aylık/yıllık planlar; her plan bir
 * miktar evrak kotası ve AI kredisi içerir, aşımda `quota_packages`'tan tek seferlik ek
 * paket alınır. Ödeme sağlayıcısı geldiğinde yalnızca bir adapter yazılacak; tablolar,
 * durum makinesi ve kota tahsis akışı burada hazır.
 */
export class CreateBillingTables1786400000000 implements MigrationInterface {
  name = 'CreateBillingTables1786400000000';

  private async tableMissing(q: QueryRunner, name: string): Promise<boolean> {
    const rows: Array<{ c: number }> = await q.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [name],
    );
    return Number(rows[0].c) === 0;
  }

  private async columnMissing(q: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows: Array<{ c: number }> = await q.query(
      `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column],
    );
    return Number(rows[0].c) === 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    if (await this.tableMissing(q, 'subscription_plans')) {
      await q.query(`
        CREATE TABLE subscription_plans (
            id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
            code                VARCHAR(50)     NOT NULL,
            name                VARCHAR(120)    NOT NULL,
            description         VARCHAR(255)    NULL,
            -- Planın kime satıldığı: mükellef mi mali müşavir mi.
            audience            ENUM('taxpayer','accountant') NOT NULL,
            price_monthly       DECIMAL(10,2)   NOT NULL DEFAULT 0,
            price_yearly        DECIMAL(10,2)   NOT NULL DEFAULT 0,
            currency            CHAR(3)         NOT NULL DEFAULT 'TRY',
            -- Plana dahil aylık evrak kotası ve AI kredisi.
            included_quota      BIGINT UNSIGNED NOT NULL DEFAULT 0,
            included_ai_credits BIGINT UNSIGNED NOT NULL DEFAULT 0,
            -- Müşavir planları için: aynı anda yönetilebilecek mükellef sayısı (0 = sınırsız).
            max_taxpayers       INT UNSIGNED    NOT NULL DEFAULT 0,
            trial_days          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            features            JSON            NULL,
            is_active           TINYINT(1)      NOT NULL DEFAULT 1,
            is_public           TINYINT(1)      NOT NULL DEFAULT 1,
            sort_order          SMALLINT        NOT NULL DEFAULT 0,
            created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_plan_code (code),
            KEY idx_plan_audience (audience, is_active, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
      `);
    }

    if (await this.tableMissing(q, 'subscriptions')) {
      await q.query(`
        CREATE TABLE subscriptions (
            id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            uuid                  CHAR(36)        NOT NULL DEFAULT (UUID()),
            user_id               BIGINT UNSIGNED NOT NULL,
            plan_id               INT UNSIGNED    NOT NULL,
            status                ENUM('trialing','active','past_due','canceled','expired')
                                  NOT NULL DEFAULT 'active',
            billing_period        ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly',
            current_period_start  DATETIME        NOT NULL,
            current_period_end    DATETIME        NOT NULL,
            cancel_at_period_end  TINYINT(1)      NOT NULL DEFAULT 0,
            canceled_at           DATETIME        NULL,
            -- Sağlayıcı tarafındaki abonelik/kart referansı (iyzico, PayTR…). Şimdilik boş.
            provider              VARCHAR(50)     NULL,
            provider_ref          VARCHAR(191)    NULL,
            note                  VARCHAR(255)    NULL,
            created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_subscription_uuid (uuid),
            -- Bir kullanıcının aynı anda EN FAZLA BİR yürürlükteki aboneliği olur.
            -- Sanal sütun: yalnızca yürürlükteki (trialing/active/past_due) satırlar için
            -- user_id, diğerleri NULL → NULL'lar UNIQUE indekste çakışmaz.
            -- VIRTUAL (STORED değil): user_id hem bu generated kolonun baz kolonu hem de
            -- ON DELETE CASCADE'li FK kolonudur; InnoDB STORED generated kolonun baz
            -- kolonunda cascade'e izin vermez (ERROR 1215) — aynı tuzak
            -- accountant_authorizations.active_lock'ta da yaşandı.
            active_lock           BIGINT UNSIGNED GENERATED ALWAYS AS (
                                    CASE WHEN status IN ('trialing','active','past_due')
                                         THEN user_id ELSE NULL END) VIRTUAL,
            UNIQUE KEY uq_active_subscription_per_user (active_lock),
            KEY idx_subscription_user (user_id, status),
            KEY idx_subscription_period_end (status, current_period_end),
            CONSTRAINT fk_subscription_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_subscription_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci
      `);
    }

    // payments tablosu zaten vardı (yalnızca kota paketi satışı için tasarlanmıştı).
    // Abonelik tahsilatlarını ve sağlayıcı yanıtlarını da taşıyabilmesi için genişletiliyor.
    if (await this.columnMissing(q, 'payments', 'kind')) {
      await q.query(`
        ALTER TABLE payments
          ADD COLUMN kind ENUM('subscription','quota_package','ai_credits')
              NOT NULL DEFAULT 'quota_package' AFTER package_id,
          ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER taxpayer_id,
          ADD COLUMN subscription_id BIGINT UNSIGNED NULL AFTER kind,
          ADD COLUMN ai_credits_granted BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER quota_granted,
          ADD COLUMN description VARCHAR(255) NULL AFTER ai_credits_granted,
          ADD COLUMN failure_reason VARCHAR(255) NULL AFTER status,
          ADD COLUMN provider_payload JSON NULL AFTER failure_reason,
          ADD KEY idx_payment_user (user_id, status)
      `);
      // (provider, provider_ref) üzerinde zaten UNIQUE indeks var (uq_payment_provider_ref,
      // bkz. 01_schema.sql) — ikinci bir indeks eklenmiyor.
      // taxpayer_id daha önce NOT NULL'dı; müşavir abonelikleri mükellefe bağlı olmadığı
      // için nullable hale getiriliyor (ödeme ya bir mükellefe ya bir kullanıcıya aittir).
      await q.query(`ALTER TABLE payments MODIFY COLUMN taxpayer_id BIGINT UNSIGNED NULL`);
    }

    // Örnek planlar — fiyatlar admin panelinden değiştirilebilir, burada yalnızca iskelet.
    const planCount: Array<{ c: number }> = await q.query('SELECT COUNT(*) AS c FROM subscription_plans');
    if (Number(planCount[0].c) === 0) {
      await q.query(`
        INSERT INTO subscription_plans
          (code, name, description, audience, price_monthly, price_yearly, included_quota,
           included_ai_credits, max_taxpayers, trial_days, sort_order, features)
        VALUES
          ('mukellef_baslangic', 'Başlangıç', 'Tek şirket, temel evrak yönetimi', 'taxpayer',
           249.00, 2490.00, 500, 50, 0, 14, 10,
           CAST('["500 evrak/ay","50 AI dijitalleştirme","Mobil uygulama","E-posta destek"]' AS JSON)),
          ('mukellef_standart', 'Standart', 'Büyüyen işletmeler için', 'taxpayer',
           499.00, 4990.00, 2000, 200, 0, 14, 20,
           CAST('["2.000 evrak/ay","200 AI dijitalleştirme","Toplu yükleme","Öncelikli destek"]' AS JSON)),
          ('mukellef_pro', 'Profesyonel', 'Yoğun evrak akışı olan işletmeler', 'taxpayer',
           999.00, 9990.00, 10000, 750, 0, 14, 30,
           CAST('["10.000 evrak/ay","750 AI dijitalleştirme","Tüm evrak türleri","Telefon destek"]' AS JSON)),
          ('musavir_ofis_s', 'Ofis S', '10 mükellefe kadar', 'accountant',
           999.00, 9990.00, 5000, 300, 10, 14, 10,
           CAST('["10 mükellef","5.000 evrak/ay","Luca içe/dışa aktarım","300 AI dijitalleştirme"]' AS JSON)),
          ('musavir_ofis_m', 'Ofis M', '30 mükellefe kadar', 'accountant',
           1990.00, 19900.00, 20000, 1000, 30, 14, 20,
           CAST('["30 mükellef","20.000 evrak/ay","Luca içe/dışa aktarım","1.000 AI dijitalleştirme"]' AS JSON)),
          ('musavir_ofis_l', 'Ofis L', 'Sınırsız mükellef', 'accountant',
           3990.00, 39900.00, 60000, 3000, 0, 14, 30,
           CAST('["Sınırsız mükellef","60.000 evrak/ay","Luca içe/dışa aktarım","3.000 AI dijitalleştirme","Öncelikli destek"]' AS JSON))
      `);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS subscriptions`);
    await q.query(`DROP TABLE IF EXISTS subscription_plans`);
    await q.query(`
      ALTER TABLE payments
        DROP KEY idx_payment_user,
        DROP COLUMN provider_payload,
        DROP COLUMN failure_reason,
        DROP COLUMN description,
        DROP COLUMN ai_credits_granted,
        DROP COLUMN subscription_id,
        DROP COLUMN user_id,
        DROP COLUMN kind
    `);
  }
}
