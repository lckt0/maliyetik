-- ============================================================================
--  Maliyetik — MySQL 8.0 Schema
--  Engine : InnoDB
--  Charset: utf8mb4 / Collation: utf8mb4_tr_0900_ai_ci  (Türkçe i/İ duyarlı)
--
--  Bu dosya `docker-entrypoint-initdb.d` üzerinden ilk kalkışta otomatik
--  çalışır. TypeORM migration'ları (backend/src/database/migrations) bu şemayı
--  birebir yansıtır; bu SQL şemanın kaynak-of-truth halidir.
-- ============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
--  users — Tüm roller tek tabloda (admin / taxpayer / accountant)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid              CHAR(36)        NOT NULL DEFAULT (UUID()),
    email             VARCHAR(255)    NOT NULL,
    password_hash     VARCHAR(255)    NOT NULL,
    full_name         VARCHAR(150)    NOT NULL,
    phone             VARCHAR(20)     NULL,
    role              ENUM('admin','taxpayer','accountant') NOT NULL,
    status            ENUM('active','suspended','pending')  NOT NULL DEFAULT 'active',
    -- Profil / herkese açık sayfa (<site>/u/username)
    username          VARCHAR(30)     NULL,               -- [a-z0-9_], küçük harfe normalize edilir
    bio               TEXT            NULL,                -- sanitize edilmiş (allowlist) HTML — zengin metin biyografi
    avatar_path       VARCHAR(500)    NULL,                -- depolamadaki (GCS) yol; imzalı URL istekte üretilir
    is_public         TINYINT(1)      NOT NULL DEFAULT 0,  -- true ise /u/:username herkese açık
    ui_preferences    JSON            NULL,                -- tema/sidebar gibi arayüz tercihleri (cihazlar arası senkron)
    email_verified_at DATETIME        NULL,
    last_login_at     DATETIME        NULL,
    -- Evrak Dijitalleştir (AI) kredisi — mükellef/mali müşavir hesabı başına (bkz. ai_credit_ledger).
    ai_credits_limit  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ai_credits_used   BIGINT UNSIGNED NOT NULL DEFAULT 0,
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at        DATETIME        NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_uuid     (uuid),
    UNIQUE KEY uq_users_email    (email),
    UNIQUE KEY uq_users_username (username),
    KEY idx_users_role_status (role, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  accountant_profiles — Mali Müşavir profili (1:1 users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accountant_profiles (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id       BIGINT UNSIGNED NOT NULL,
    display_title VARCHAR(255)    NOT NULL,            -- SMMM / YMM unvanı
    license_no    VARCHAR(50)     NULL,                -- ruhsat / oda sicil no
    vkn_tckn      VARCHAR(11)     NULL,
    office_name   VARCHAR(255)    NULL,
    city          VARCHAR(80)     NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_accountant_user (user_id),
    KEY idx_accountant_license (license_no),
    CONSTRAINT fk_accountant_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  taxpayer_profiles — Mükellef profili (1:1 users)
--    * current_accountant_id : hız için denormalize "mevcut aktif müşavir"
--      pointer'ı. Kaynak-of-truth = accountant_authorizations. Yetkilendirme
--      aktifleştiği transaction'da uygulama tarafından senkronlanır.
--    * quota_limit / quota_used : denormalize kota sayaçları
--      (hareket geçmişi = quota_ledger).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS taxpayer_profiles (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id               BIGINT UNSIGNED NOT NULL,
    company_title         VARCHAR(255)    NOT NULL,     -- Unvan
    tax_office            VARCHAR(120)    NULL,          -- Vergi dairesi
    vkn_tckn              VARCHAR(11)     NOT NULL,       -- VKN(10) / TCKN(11)
    address               VARCHAR(500)    NULL,
    current_accountant_id BIGINT UNSIGNED NULL,
    quota_limit           BIGINT UNSIGNED NOT NULL DEFAULT 0,
    quota_used            BIGINT UNSIGNED NOT NULL DEFAULT 0,
    accountant_can_view_quota      TINYINT(1) NOT NULL DEFAULT 1,  -- Mali müşavir kota+geçmişini görebilir mi
    accountant_can_view_ai_credits TINYINT(1) NOT NULL DEFAULT 1,  -- Mali müşavir AI kredi+geçmişini görebilir mi
    luca_kasa_hesap_kodu       VARCHAR(20) NULL,  -- Dışa Aktar → Z-Raporu/Luca Excel hesap kodları
    luca_kredi_karti_hesap_kodu VARCHAR(20) NULL,
    luca_yemek_karti_hesap_kodu VARCHAR(20) NULL,
    luca_kdv0_toplam_hesap_kodu     VARCHAR(20) NULL,
    luca_kdv10_toplam_hesap_kodu    VARCHAR(20) NULL,
    luca_kdv10_hesaplanan_hesap_kodu VARCHAR(20) NULL,
    luca_kdv20_toplam_hesap_kodu    VARCHAR(20) NULL,
    luca_kdv20_hesaplanan_hesap_kodu VARCHAR(20) NULL,
    luca_belge_turu            VARCHAR(20) NULL,
    created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_taxpayer_user (user_id),
    UNIQUE KEY uq_taxpayer_vkn  (vkn_tckn),
    KEY idx_taxpayer_accountant (current_accountant_id),
    CONSTRAINT fk_taxpayer_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_taxpayer_accountant
        FOREIGN KEY (current_accountant_id) REFERENCES accountant_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  accountant_authorizations — Mükellef → Müşavir yetkilendirme + geçmiş
--
--  İŞ KURALI: Bir mükellefin aynı anda EN FAZLA 1 aktif müşaviri olabilir.
--  Bu, `active_lock` generated STORED kolonu ile DB seviyesinde garanti edilir:
--  UNIQUE indeks NULL değerleri yok saydığından, yalnızca status='active'
--  satırlar için taxpayer_id benzersizliği zorlanır. Müşavir tarafı doğal
--  olarak 1-to-N (bir müşavir N mükellef) — ek kısıt gerekmez.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accountant_authorizations (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    taxpayer_id   BIGINT UNSIGNED NOT NULL,
    accountant_id BIGINT UNSIGNED NOT NULL,
    status        ENUM('pending','active','revoked','rejected') NOT NULL DEFAULT 'pending',
    requested_by  ENUM('taxpayer','accountant')                 NOT NULL DEFAULT 'taxpayer',
    note          VARCHAR(255)    NULL,
    authorized_at DATETIME        NULL,
    revoked_at    DATETIME        NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- VIRTUAL (STORED değil): taxpayer_id hem bu generated kolonun baz kolonu hem de
    -- ON DELETE CASCADE'li FK kolonudur. InnoDB, STORED bir generated kolonun baz kolonunda
    -- cascade referential action'a izin vermez (ERROR 1215). VIRTUAL bu kısıttan muaftır ve
    -- üzerine UNIQUE ikincil indeks desteklenir → hem cascade hem DB-garantili "1 aktif" kuralı.
    active_lock   BIGINT UNSIGNED
        GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN taxpayer_id ELSE NULL END) VIRTUAL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_active_accountant_per_taxpayer (active_lock),
    KEY idx_auth_accountant_status (accountant_id, status),
    KEY idx_auth_taxpayer_status   (taxpayer_id, status),
    CONSTRAINT fk_auth_taxpayer
        FOREIGN KEY (taxpayer_id)   REFERENCES taxpayer_profiles(id)   ON DELETE CASCADE,
    CONSTRAINT fk_auth_accountant
        FOREIGN KEY (accountant_id) REFERENCES accountant_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  document_types — Evrak türü referansı + dinamik form/validasyon şeması
--    metadata_schema : türe özel alanların JSON-Schema benzeri tanımı;
--    hem frontend dinamik formu hem backend validasyonu bunu kullanır.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_types (
    id              SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    code            VARCHAR(50)  NOT NULL,               -- 'e_fatura', 'z_raporu', ...
    name            VARCHAR(120) NOT NULL,               -- 'E-Fatura'
    category        ENUM('financial','company','other') NOT NULL DEFAULT 'financial',
    metadata_schema JSON         NULL,
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    is_required     TINYINT(1)   NOT NULL DEFAULT 0,     -- 'company' kategorisi için: zorunlu şirket evrakı mı
    sort_order      SMALLINT     NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_doctype_code (code),
    KEY idx_doctype_category (category, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  documents — Tüm evraklar (finansal + şirket). Milyonlarca satır hedefli.
--
--  Meta veri: esnek `metadata JSON`. Türler arası ORTAK/SICAK filtre alanları
--  kanonik JSON anahtarlarından `GENERATED ... STORED` kolonlara çıkarılır ve
--  indekslenir → JSON'a dokunmadan normal kolon hızında filtreleme.
--
--  Sahiplik/erişim:
--    taxpayer_id         = evrağın sahibi (mükellef)
--    uploaded_by_user_id = yükleyen aktör (mükellef VEYA aktif müşaviri)
--  Şirket Evraklarım = document_type.category='company' olan satırlar
--  (ayrı tablo yok; erişim scope'u standart yetkilendirmeyle aynı).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
    id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
    uuid                CHAR(36)          NOT NULL DEFAULT (UUID()),
    taxpayer_id         BIGINT UNSIGNED   NOT NULL,
    document_type_id    SMALLINT UNSIGNED NOT NULL,
    uploaded_by_user_id BIGINT UNSIGNED   NOT NULL,
    updated_by_user_id  BIGINT UNSIGNED   NULL,           -- son değişikliği yapan (yüklemede yükleyenle aynı)

    -- ---- Evrak Kayıt / Dijitalleştirme ----
    -- Hızlı kayıt akışında (yalnızca tür + dosya) alanlar boş kalır; is_digitized=0.
    -- Dijitalleştirme formunda alanlar doldurulup kaydedilince 1'e döner ve
    -- digitized_by/digitized_at set edilir. Kota hızlı kayıt anında tüketilir,
    -- dijitalleştirme tekrar tüketmez.
    is_digitized        TINYINT(1)        NOT NULL DEFAULT 1,
    digitized_by_user_id BIGINT UNSIGNED  NULL,
    digitized_at        DATETIME          NULL,

    title               VARCHAR(255)      NOT NULL,
    description         TEXT              NULL,
    document_date       DATE              NULL,          -- evrak tarihi (fatura/makbuz tarihi vb.)

    -- ---- GCS depolama ----
    storage_bucket      VARCHAR(120)      NOT NULL,
    storage_path        VARCHAR(500)      NOT NULL,      -- object key
    original_name       VARCHAR(255)      NULL,
    mime_type           VARCHAR(120)      NULL,
    file_size           BIGINT UNSIGNED   NULL,
    checksum_sha256     CHAR(64)          NULL,

    -- ---- esnek meta veri ----
    metadata            JSON              NULL,

    -- ---- generated & indexed SICAK filtre kolonları (kanonik JSON anahtarları) ----
    meta_amount       DECIMAL(18,2)
        GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.totalAmount')) AS DECIMAL(18,2))) STORED,
    meta_tax_amount   DECIMAL(18,2)
        GENERATED ALWAYS AS (CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.taxAmount'))   AS DECIMAL(18,2))) STORED,
    meta_tax_id       VARCHAR(11)
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.vknTckn')))            STORED,
    meta_counterparty VARCHAR(255)
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.counterpartyTitle'))) STORED,
    meta_doc_no       VARCHAR(50)
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.documentNo')))         STORED,
    meta_currency     VARCHAR(3)
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.currency')))           STORED,
    meta_direction    VARCHAR(10)
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.direction')))           STORED,
    meta_receipt_group_no VARCHAR(50)
        GENERATED ALWAYS AS (JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.receiptGroupNo')))       STORED,

    status              ENUM('active','archived','deleted') NOT NULL DEFAULT 'active',
    created_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at          DATETIME          NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uq_documents_uuid (uuid),

    -- ana desen: mükellef + tür, en yeni önce (türe özel listeleme sayfaları)
    KEY idx_doc_owner_type_date (taxpayer_id, document_type_id, document_date DESC, id DESC),
    -- genel akış / "son yüklenenler"
    KEY idx_doc_owner_created   (taxpayer_id, created_at DESC),
    KEY idx_doc_uploader        (uploaded_by_user_id),
    -- sıcak meta filtreleri
    KEY idx_doc_meta_amount     (taxpayer_id, document_type_id, meta_amount),
    KEY idx_doc_meta_tax_id     (meta_tax_id),
    KEY idx_doc_meta_doc_no     (document_type_id, meta_doc_no),
    KEY idx_doc_meta_counterparty (taxpayer_id, meta_counterparty),
    KEY idx_doc_meta_direction  (taxpayer_id, document_type_id, meta_direction),
    KEY idx_doc_meta_receipt_group (taxpayer_id, document_type_id, meta_receipt_group_no),
    KEY idx_doc_status          (status),
    -- Evrak Dijitalleştir sayfası kuyruğu: bekleyenler listesi
    KEY idx_doc_digitized       (taxpayer_id, is_digitized, created_at),

    CONSTRAINT fk_doc_taxpayer
        FOREIGN KEY (taxpayer_id)         REFERENCES taxpayer_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_type
        FOREIGN KEY (document_type_id)    REFERENCES document_types(id),
    CONSTRAINT fk_doc_uploader
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id),
    CONSTRAINT fk_doc_updater
        FOREIGN KEY (updated_by_user_id)  REFERENCES users(id),
    CONSTRAINT fk_doc_digitizer
        FOREIGN KEY (digitized_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- Türe özel örnek fonksiyonel indeks (yalnızca ihtiyaç olan sorgu için açılır):
-- ALTER TABLE documents
--   ADD KEY idx_doc_meta_due_date ((CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.dueDate')) AS DATE)));

-- ---------------------------------------------------------------------------
--  quota_ledger — Kota hareket defteri (audit; sayaçların kaynak-of-truth'u)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quota_ledger (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    taxpayer_id    BIGINT UNSIGNED NOT NULL,
    change_amount  BIGINT          NOT NULL,             -- +tahsis/satın alma, -tüketim
    balance_after  BIGINT          NOT NULL,             -- işlem sonrası kalan (limit-used)
    reason         ENUM('initial','purchase','admin_grant','consume','refund','adjustment') NOT NULL,
    reference_type VARCHAR(50)     NULL,                 -- 'document','payment', ...
    reference_id   BIGINT UNSIGNED NULL,
    note           VARCHAR(255)    NULL,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_quota_taxpayer_created (taxpayer_id, created_at DESC),
    CONSTRAINT fk_quota_taxpayer
        FOREIGN KEY (taxpayer_id) REFERENCES taxpayer_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  ai_credit_ledger — AI kredisi hareket defteri (audit; users.ai_credits_*
--  sayaçlarının kaynak-of-truth'u). quota_ledger ile birebir aynı desen,
--  yalnızca taxpayer_profiles yerine users'a bağlı (kredi kullanıcı bazında).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_credit_ledger (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id        BIGINT UNSIGNED NOT NULL,
    change_amount  BIGINT          NOT NULL,             -- +tahsis, -tüketim/+iade
    balance_after  BIGINT          NOT NULL,             -- işlem sonrası kalan (limit-used)
    reason         ENUM('initial','admin_grant','consume','refund','adjustment') NOT NULL,
    reference_type VARCHAR(50)     NULL,                 -- 'document', ...
    reference_id   BIGINT UNSIGNED NULL,
    note           VARCHAR(255)    NULL,
    created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_ai_credit_user_created (user_id, created_at DESC),
    CONSTRAINT fk_ai_credit_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  quota_packages — (İleri) Sanal POS ile satılabilir kota paketleri
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quota_packages (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    code         VARCHAR(50)   NOT NULL,
    name         VARCHAR(120)  NOT NULL,
    quota_amount BIGINT UNSIGNED NOT NULL,
    price        DECIMAL(10,2) NOT NULL,
    currency     VARCHAR(3)    NOT NULL DEFAULT 'TRY',
    is_active    TINYINT(1)    NOT NULL DEFAULT 1,
    sort_order   SMALLINT      NOT NULL DEFAULT 0,
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_package_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  subscription_plans — Satılabilir abonelik planları (mükellef / mali müşavir).
--  Fiyat ve içerik admin panelinden düzenlenir; `code` sabittir (ödeme
--  sağlayıcısındaki ürün eşlemesi buna dayanacak).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    code                VARCHAR(50)     NOT NULL,
    name                VARCHAR(120)    NOT NULL,
    description         VARCHAR(255)    NULL,
    audience            ENUM('taxpayer','accountant') NOT NULL,
    price_monthly       DECIMAL(10,2)   NOT NULL DEFAULT 0,
    price_yearly        DECIMAL(10,2)   NOT NULL DEFAULT 0,
    currency            CHAR(3)         NOT NULL DEFAULT 'TRY',
    included_quota      BIGINT UNSIGNED NOT NULL DEFAULT 0,
    included_ai_credits BIGINT UNSIGNED NOT NULL DEFAULT 0,
    max_taxpayers       INT UNSIGNED    NOT NULL DEFAULT 0,   -- 0 = sınırsız
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  subscriptions — Kullanıcının aboneliği. "En fazla BİR yürürlükteki abonelik"
--  kuralı `active_lock` sanal sütunu + UNIQUE indeksle DB'de garanti edilir
--  (aynı desen: accountant_authorizations.active_lock).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid                  CHAR(36)        NOT NULL DEFAULT (UUID()),
    user_id               BIGINT UNSIGNED NOT NULL,
    plan_id               INT UNSIGNED    NOT NULL,
    status                ENUM('trialing','active','past_due','canceled','expired') NOT NULL DEFAULT 'active',
    billing_period        ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly',
    current_period_start  DATETIME        NOT NULL,
    current_period_end    DATETIME        NOT NULL,
    cancel_at_period_end  TINYINT(1)      NOT NULL DEFAULT 0,
    canceled_at           DATETIME        NULL,
    provider              VARCHAR(50)     NULL,
    provider_ref          VARCHAR(191)    NULL,
    note                  VARCHAR(255)    NULL,
    created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- VIRTUAL (STORED değil): user_id hem bu generated kolonun baz kolonu hem de
    -- ON DELETE CASCADE'li FK kolonu; InnoDB STORED'da cascade'e izin vermez (ERROR 1215).
    active_lock           BIGINT UNSIGNED GENERATED ALWAYS AS (
                            CASE WHEN status IN ('trialing','active','past_due')
                                 THEN user_id ELSE NULL END) VIRTUAL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_subscription_uuid (uuid),
    UNIQUE KEY uq_active_subscription_per_user (active_lock),
    KEY idx_subscription_user (user_id, status),
    KEY idx_subscription_period_end (status, current_period_end),
    CONSTRAINT fk_subscription_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_subscription_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  payments — Abonelik ve tek seferlik (kota/AI kredi) tahsilatları. Sanal POS
--  entegrasyonu gelene kadar yalnızca 'mock' sağlayıcıyla ve admin'in elle
--  atamasıyla dolar; sağlayıcı eklendiğinde aynı satırlar kullanılır.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid               CHAR(36)        NOT NULL DEFAULT (UUID()),
    taxpayer_id        BIGINT UNSIGNED NULL,              -- kota/AI alımlarında dolu
    user_id            BIGINT UNSIGNED NULL,              -- ödemeyi yapan (abonelikte tek bağ)
    package_id         INT UNSIGNED    NULL,
    kind               ENUM('subscription','quota_package','ai_credits') NOT NULL DEFAULT 'quota_package',
    subscription_id    BIGINT UNSIGNED NULL,
    provider           VARCHAR(50)     NULL,              -- 'iyzico','paytr','mock', ...
    provider_ref       VARCHAR(191)    NULL,              -- sağlayıcı işlem/token no
    amount             DECIMAL(10,2)   NOT NULL,
    currency           VARCHAR(3)      NOT NULL DEFAULT 'TRY',
    quota_granted      BIGINT UNSIGNED NOT NULL DEFAULT 0,
    ai_credits_granted BIGINT UNSIGNED NOT NULL DEFAULT 0,
    description        VARCHAR(255)    NULL,
    status             ENUM('pending','paid','failed','refunded','cancelled') NOT NULL DEFAULT 'pending',
    failure_reason     VARCHAR(255)    NULL,
    provider_payload   JSON            NULL,              -- sağlayıcının ham yanıtı (uyuşmazlık kanıtı)
    paid_at            DATETIME        NULL,
    created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_payment_uuid (uuid),
    UNIQUE KEY uq_payment_provider_ref (provider, provider_ref),
    KEY idx_payment_taxpayer_status (taxpayer_id, status),
    KEY idx_payment_user (user_id, status),
    CONSTRAINT fk_payment_taxpayer
        FOREIGN KEY (taxpayer_id) REFERENCES taxpayer_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_package
        FOREIGN KEY (package_id)  REFERENCES quota_packages(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  refresh_tokens — JWT refresh rotasyonu (token'ın SHA-256 hash'i saklanır)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id    BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64)        NOT NULL,
    expires_at DATETIME        NOT NULL,
    revoked_at DATETIME        NULL,
    user_agent VARCHAR(255)    NULL,
    ip_address VARBINARY(16)   NULL,
    created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_refresh_token_hash (token_hash),
    KEY idx_refresh_user (user_id, expires_at),
    CONSTRAINT fk_refresh_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  audit_logs — Denetim izi (kim, ne, hangi mükellef kapsamında)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    actor_user_id BIGINT UNSIGNED NULL,
    action        VARCHAR(80)     NOT NULL,              -- 'document.upload','auth.grant', ...
    entity_type   VARCHAR(50)     NULL,
    entity_id     BIGINT UNSIGNED NULL,
    taxpayer_id   BIGINT UNSIGNED NULL,                  -- kapsam
    ip_address    VARBINARY(16)   NULL,
    metadata      JSON            NULL,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    -- Trailing kolon `id` (created_at değil): keyset sayfalama `ORDER BY id DESC` yapıyor,
    -- `id` her zaman `created_at` ile aynı sırada arttığından filtre + sıralama tek indeks
    -- taramasında karşılanır (bkz. OptimizeAuditLogsIndexes migration).
    KEY idx_audit_actor    (actor_user_id, id),
    KEY idx_audit_entity   (entity_type, entity_id),
    KEY idx_audit_taxpayer (taxpayer_id, id),
    KEY idx_audit_action   (action, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  notifications — Kullanıcıya özel bildirimler (zil ikonu). `type` serbest bir
--  ayrımcı (ör. 'possible_duplicate_document') — ileride başka türler de aynı
--  tabloyu kullanabilir.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  notes — Kullanıcının kişisel notları. `remind_at` doluysa vakti geldiğinde
--  bildirim + (tercihe göre) e-posta gönderilir ve `reminded_at` damgalanır;
--  bu damga aynı hatırlatmanın iki kez düşmesini engeller.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    uuid        CHAR(36)        NOT NULL DEFAULT (UUID()),
    user_id     BIGINT UNSIGNED NOT NULL,
    content     TEXT            NOT NULL,
    pinned      TINYINT(1)      NOT NULL DEFAULT 0,
    done_at     DATETIME        NULL,
    remind_at   DATETIME        NULL,
    reminded_at DATETIME        NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_note_uuid (uuid),
    KEY idx_note_user (user_id, pinned, updated_at),
    KEY idx_note_due (reminded_at, remind_at),
    CONSTRAINT fk_note_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  announcements — Admin tarafından gönderilen sistem duyuruları. Gönderilince
--  tüm aktif kullanıcılara `notifications` (type='system_announcement') olarak
--  da düşer; bu tablo anasayfadaki ayrı "Sistem Duyuruları" listesi içindir.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title              VARCHAR(255)    NOT NULL,
    body               TEXT            NOT NULL,
    created_by_user_id BIGINT UNSIGNED NULL,
    created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_announcements_created (created_at DESC),
    CONSTRAINT fk_announcement_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  system_settings — Tekil satır (id=1): kayıt açık/kapalı, bakım modu ve
--  bakım modu sırasında erişime izin verilen IP allowlist'i.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
    id                            TINYINT UNSIGNED NOT NULL DEFAULT 1,
    registration_enabled          TINYINT(1)       NOT NULL DEFAULT 1,
    taxpayer_approval_required    TINYINT(1)       NOT NULL DEFAULT 0,
    accountant_approval_required  TINYINT(1)       NOT NULL DEFAULT 0,
    maintenance_mode              TINYINT(1)       NOT NULL DEFAULT 0,
    maintenance_allowed_ips       JSON             NOT NULL,
    taxpayer_ai_enabled           TINYINT(1)       NOT NULL DEFAULT 1,
    accountant_ai_enabled         TINYINT(1)       NOT NULL DEFAULT 1,
    taxpayer_mobile_app_enabled   TINYINT(1)       NOT NULL DEFAULT 1,
    accountant_mobile_app_enabled TINYINT(1)       NOT NULL DEFAULT 1,
    admin_mobile_app_enabled      TINYINT(1)       NOT NULL DEFAULT 1,
    updated_by_user_id            BIGINT UNSIGNED  NULL,
    updated_at                    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT fk_system_settings_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  email_verification_tokens — kayıt sonrası e-posta doğrulama. Ham token
--  yalnızca e-postadaki linkte bulunur; burada SHA-256 hash'i saklanır
--  (refresh_tokens ile aynı desen).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    token_hash  CHAR(64)        NOT NULL,
    expires_at  DATETIME        NOT NULL,
    consumed_at DATETIME        NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_email_verif_token_hash (token_hash),
    KEY idx_email_verif_user (user_id, expires_at),
    CONSTRAINT fk_email_verif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  password_reset_tokens — admin panelinden üretilen şifre sıfırlama
--  bağlantıları. Ham token yalnızca linkte bulunur, burada SHA-256 hash'i
--  saklanır (email_verification_tokens ile aynı desen).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id     BIGINT UNSIGNED NOT NULL,
    token_hash  CHAR(64)        NOT NULL,
    expires_at  DATETIME        NOT NULL,
    consumed_at DATETIME        NULL,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_password_reset_token_hash (token_hash),
    KEY idx_password_reset_user (user_id, expires_at),
    CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

-- ---------------------------------------------------------------------------
--  infra_costs — Admin'in elle işlediği altyapı/servis maliyeti defteri
--  (sunucu, hosting, veritabanı, depolama, domain, e-posta, vb.).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS infra_costs (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name              VARCHAR(150)    NOT NULL,
    category          ENUM('server','hosting','database','storage','domain','email','other') NOT NULL DEFAULT 'other',
    provider          VARCHAR(100)    NULL,
    amount            DECIMAL(12,2)   NOT NULL,
    currency          VARCHAR(3)      NOT NULL DEFAULT 'TRY',
    billing_cycle     ENUM('monthly','yearly','one_time') NOT NULL DEFAULT 'monthly',
    next_billing_date DATE            NULL,
    note              VARCHAR(1000)   NULL,
    is_active         TINYINT(1)      NOT NULL DEFAULT 1,
    created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_infra_cost_category (category, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_tr_0900_ai_ci;

SET FOREIGN_KEY_CHECKS = 1;
