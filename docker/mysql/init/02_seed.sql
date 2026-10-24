-- ============================================================================
--  Maliyetik — Seed / Referans Verileri
--
--  document_types.metadata_schema : türe özel alan tanımları. Frontend dinamik
--  formu ve backend validasyonu bu şemayı kullanır. Alan descriptor'ı:
--    { key, label, type, required, canonical? }
--  `canonical:true` olan alanlar `documents` tablosundaki generated meta_*
--  kolonlarına çıkar (kanonik JSON anahtarları):
--    documentNo, totalAmount, taxAmount, vknTckn, counterpartyTitle, currency
--  `documentDate` alanı ayrıca `documents.document_date` kolonuna yazılır.
--
--  NOT: Varsayılan admin kullanıcısı SQL'de tutulmaz; backend seeder
--  (`npm run seed`) ADMIN_EMAIL / ADMIN_PASSWORD env'lerinden bcrypt hash'i
--  üretip oluşturur. Böylece parola hash'i repoda yer almaz.
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
--  FINANSAL evrak türleri
-- ---------------------------------------------------------------------------
INSERT INTO document_types (code, name, category, sort_order, metadata_schema) VALUES
('e_arsiv_fatura', 'E-Arşiv Fatura', 'financial', 10, CAST('{"fields":[
    {"key":"documentNo","label":"Fatura No","type":"string","required":true,"canonical":true},
    {"key":"documentDate","label":"Fatura Tarihi","type":"date","required":true},
    {"key":"direction","label":"Alış/Satış","type":"enum","required":true,"canonical":true,"options":["alis","satis"]},
    {"key":"vknTckn","label":"VKN/TCKN","type":"string","required":true,"canonical":true},
    {"key":"counterpartyTitle","label":"Unvan","type":"string","required":true,"canonical":true},
    {"key":"totalAmount","label":"Toplam Tutar","type":"decimal","required":true,"canonical":true},
    {"key":"taxAmount","label":"KDV Tutarı","type":"decimal","required":true,"canonical":true},
    {"key":"currency","label":"Para Birimi","type":"string","required":true,"canonical":true,"default":"TRY"}
]}' AS JSON)),

('e_fatura', 'E-Fatura', 'financial', 20, CAST('{"fields":[
    {"key":"documentNo","label":"Fatura No","type":"string","required":true,"canonical":true},
    {"key":"documentDate","label":"Fatura Tarihi","type":"date","required":true},
    {"key":"direction","label":"Alış/Satış","type":"enum","required":true,"canonical":true,"options":["alis","satis"]},
    {"key":"vknTckn","label":"VKN/TCKN","type":"string","required":true,"canonical":true},
    {"key":"counterpartyTitle","label":"Unvan","type":"string","required":true,"canonical":true},
    {"key":"totalAmount","label":"Toplam Tutar","type":"decimal","required":true,"canonical":true},
    {"key":"taxAmount","label":"KDV Tutarı","type":"decimal","required":true,"canonical":true},
    {"key":"currency","label":"Para Birimi","type":"string","required":true,"canonical":true,"default":"TRY"}
]}' AS JSON)),

('z_raporu', 'Z-Raporu', 'financial', 30, CAST('{"fileAccept":"image/*","groupField":"receiptGroupNo","fields":[
    {"key":"documentNo","label":"Z No","type":"string","required":true,"canonical":true},
    {"key":"documentDate","label":"Tarih","type":"date","required":true},
    {"key":"receiptGroupNo","label":"Fiş Grup No","type":"string","required":false,"canonical":true},
    {"key":"totalAmount","label":"Toplam Tutar","type":"decimal","required":true,"canonical":true},
    {"key":"creditCardAmount","label":"Kredi Kartı Toplam Tutar","type":"decimal","required":false},
    {"key":"cashAmount","label":"Nakit Toplam Tutar","type":"decimal","required":false},
    {"key":"mealCardAmount","label":"Yemek Kartları Toplam Tutar","type":"decimal","required":false},
    {"key":"vat0SalesAmount","label":"%0 KDV Satış Toplamı","type":"decimal","required":false},
    {"key":"vat10SalesAmount","label":"%10 KDV Satış Toplamı","type":"decimal","required":false},
    {"key":"vat10TaxAmount","label":"%10 KDV Toplam KDV","type":"decimal","required":false},
    {"key":"vat20SalesAmount","label":"%20 KDV Satış Toplamı","type":"decimal","required":false},
    {"key":"vat20TaxAmount","label":"%20 KDV Toplam KDV","type":"decimal","required":false}
]}' AS JSON)),

('mali_hafiza', 'Mali Hafıza Dökümü', 'financial', 40, CAST('{"fields":[
    {"key":"deviceSerialNo","label":"Cihaz Sicil No","type":"string","required":true},
    {"key":"periodStart","label":"Dönem Başlangıç","type":"date","required":true},
    {"key":"periodEnd","label":"Dönem Bitiş","type":"date","required":true},
    {"key":"totalAmount","label":"Toplam Kümülatif Tutar","type":"decimal","required":true,"canonical":true}
]}' AS JSON)),

('e_defter', 'E-Defter', 'financial', 50, CAST('{"fields":[
    {"key":"period","label":"Dönem (Ay/Yıl)","type":"string","required":true},
    {"key":"documentDate","label":"Berat Tarihi","type":"date","required":false},
    {"key":"beratType","label":"Berat Türü","type":"enum","required":true,"options":["yevmiye","kebir"]},
    {"key":"documentNo","label":"Yevmiye Kontrol No","type":"string","required":false,"canonical":true}
]}' AS JSON)),

('tahsilat_makbuzu', 'Tahsilat Makbuzu', 'financial', 60, CAST('{"fields":[
    {"key":"documentNo","label":"Makbuz No","type":"string","required":true,"canonical":true},
    {"key":"documentDate","label":"Tarih","type":"date","required":true},
    {"key":"counterpartyTitle","label":"Cari Unvan","type":"string","required":true,"canonical":true},
    {"key":"totalAmount","label":"Tutar","type":"decimal","required":true,"canonical":true},
    {"key":"txnType","label":"İşlem Türü","type":"enum","required":true,"options":["nakit","havale","eft"]}
]}' AS JSON)),

('tediye_makbuzu', 'Tediye Makbuzu', 'financial', 70, CAST('{"fields":[
    {"key":"documentNo","label":"Makbuz No","type":"string","required":true,"canonical":true},
    {"key":"documentDate","label":"Tarih","type":"date","required":true},
    {"key":"counterpartyTitle","label":"Cari Unvan","type":"string","required":true,"canonical":true},
    {"key":"totalAmount","label":"Tutar","type":"decimal","required":true,"canonical":true},
    {"key":"txnType","label":"İşlem Türü","type":"enum","required":true,"options":["nakit","havale","eft"]}
]}' AS JSON)),

('alinan_cek', 'Alınan Çek', 'financial', 80, CAST('{"fields":[
    {"key":"documentNo","label":"Çek No","type":"string","required":true,"canonical":true},
    {"key":"issueDate","label":"Keşide Tarihi","type":"date","required":true},
    {"key":"dueDate","label":"Vade Tarihi","type":"date","required":true},
    {"key":"bank","label":"Banka","type":"string","required":true},
    {"key":"branch","label":"Şube","type":"string","required":false},
    {"key":"totalAmount","label":"Tutar","type":"decimal","required":true,"canonical":true},
    {"key":"counterpartyTitle","label":"Borçlu Unvanı","type":"string","required":true,"canonical":true}
]}' AS JSON)),

('verilen_cek', 'Verilen Çek', 'financial', 90, CAST('{"fields":[
    {"key":"documentNo","label":"Çek No","type":"string","required":true,"canonical":true},
    {"key":"issueDate","label":"Keşide Tarihi","type":"date","required":true},
    {"key":"dueDate","label":"Vade Tarihi","type":"date","required":true},
    {"key":"bank","label":"Banka","type":"string","required":true},
    {"key":"branch","label":"Şube","type":"string","required":false},
    {"key":"totalAmount","label":"Tutar","type":"decimal","required":true,"canonical":true},
    {"key":"counterpartyTitle","label":"Alacaklı Unvanı","type":"string","required":true,"canonical":true}
]}' AS JSON)),

('banka_ekstre', 'Banka Ekstre', 'financial', 100, CAST('{"fields":[
    {"key":"bankName","label":"Banka Adı","type":"string","required":true},
    {"key":"iban","label":"IBAN","type":"string","required":true},
    {"key":"periodStart","label":"Dönem Başlangıç","type":"date","required":true},
    {"key":"periodEnd","label":"Dönem Bitiş","type":"date","required":true},
    {"key":"openingBalance","label":"Başlangıç Bakiyesi","type":"decimal","required":true},
    {"key":"closingBalance","label":"Bitiş Bakiyesi","type":"decimal","required":true}
]}' AS JSON)),

('e_bordro', 'E-Bordro', 'financial', 110, CAST('{"fields":[
    {"key":"personnelName","label":"Personel Ad-Soyad","type":"string","required":true},
    {"key":"personnelTc","label":"TC Kimlik No","type":"string","required":true},
    {"key":"period","label":"Dönem (Ay/Yıl)","type":"string","required":true},
    {"key":"netSalary","label":"Net Ücret","type":"decimal","required":true},
    {"key":"grossSalary","label":"Brüt Ücret","type":"decimal","required":true}
]}' AS JSON)),

('sigorta', 'Sigorta Evrakları', 'financial', 120, CAST('{"fields":[
    {"key":"docKind","label":"Belge Türü","type":"string","required":true},
    {"key":"period","label":"Dönem (Ay/Yıl)","type":"string","required":true},
    {"key":"sgkRegNo","label":"SGK Sicil No","type":"string","required":true},
    {"key":"totalAmount","label":"Toplam Tutar","type":"decimal","required":true,"canonical":true}
]}' AS JSON)),

('diger', 'Diğer', 'other', 130, CAST('{"fields":[
    {"key":"documentName","label":"Belge Adı","type":"string","required":true},
    {"key":"documentDate","label":"Belge Tarihi","type":"date","required":false}
]}' AS JSON)),

-- Tür seçilmeden (ör. mobil toplu yükleme) kaydedilen evraklar için varsayılan tür.
-- "Diğer"den ayrı tutulur: biri kullanıcının bilerek seçtiği "diğer", öteki hiç seçim yapılmadığı anlamına gelir.
('belirtilmedi', 'Belirtilmedi', 'other', 131, CAST('{"fields":[
    {"key":"documentName","label":"Belge Adı","type":"string","required":false},
    {"key":"documentDate","label":"Belge Tarihi","type":"date","required":false}
]}' AS JSON));

-- "Mali Hafıza Dökümü" — Evrak Kayıt/Detaylı Yükleme tür listesinde "Mali Hafıza Raporu"
-- (gömülü Z-Raporu-grubu içe aktarma) ile isim benzerliğinden kullanıcılar tarafından
-- yanlışlıkla seçiliyor ve tek düz kayıt olarak kalıyordu (asla Z-Raporu grubuna
-- dönüşmüyordu) — bkz. migration DeactivateMaliHafizaDokumuType. Listelerden gizlenir.
UPDATE document_types SET is_active = 0 WHERE code = 'mali_hafiza';

-- "Mali Hafıza Raporu" — Evrak Kayıt'tan yüklenip Evrak Dijitalleştir'de özel bir akışla
-- (çoklu şerit/gün analizi + KDV oranı/ödeme türü onayı → N adet z_raporu kaydı) işlenen
-- taşıyıcı evrak türü. Kendi alanı yok — bkz. migration AddMaliHafizaRaporuType.
INSERT INTO document_types (code, name, category, sort_order, metadata_schema) VALUES
('mali_hafiza_raporu', 'Mali Hafıza Raporu', 'financial', 41, CAST('{"fileAccept":"image/*","fields":[]}' AS JSON));

-- ---------------------------------------------------------------------------
--  ŞİRKET evrak türleri ("Şirket Evraklarım" hızlı erişim sayfası)
-- ---------------------------------------------------------------------------
INSERT INTO document_types (code, name, category, sort_order, is_required, metadata_schema) VALUES
('imza_sirkusu', 'İmza Sirküsü', 'company', 200, 1, CAST('{"fields":[
    {"key":"documentDate","label":"Tarih","type":"date","required":false},
    {"key":"validUntil","label":"Geçerlilik Tarihi","type":"date","required":false}
]}' AS JSON)),

('vergi_levhasi', 'Vergi Levhası', 'company', 210, 1, CAST('{"fields":[
    {"key":"period","label":"Yıl","type":"string","required":false},
    {"key":"vknTckn","label":"VKN","type":"string","required":false,"canonical":true}
]}' AS JSON)),

('ticaret_sicil', 'Ticaret Sicil Gazetesi', 'company', 220, 1, CAST('{"fields":[
    {"key":"documentNo","label":"Gazete No","type":"string","required":false,"canonical":true},
    {"key":"documentDate","label":"Yayın Tarihi","type":"date","required":false}
]}' AS JSON)),

('company_diger', 'Diğer Şirket Evrağı', 'company', 230, 0, CAST('{"fields":[
    {"key":"documentName","label":"Belge Adı","type":"string","required":true},
    {"key":"documentDate","label":"Belge Tarihi","type":"date","required":false}
]}' AS JSON));

-- ---------------------------------------------------------------------------
--  Örnek kota paketleri (Sanal POS ileride)
-- ---------------------------------------------------------------------------
-- Ek kota paketleri (abonelik kotası aşıldığında tek seferlik satın alma)
INSERT INTO quota_packages (code, name, quota_amount, price, currency, sort_order) VALUES
('starter_1k',  'Başlangıç 1.000',    1000,  199.00, 'TRY', 10),
('pro_10k',     'Profesyonel 10.000', 10000, 1490.00, 'TRY', 20),
('scale_100k',  'Kurumsal 100.000',   100000, 9900.00, 'TRY', 30);

-- ---------------------------------------------------------------------------
--  system_settings — tekil satır, varsayılan değerlerle
-- ---------------------------------------------------------------------------
INSERT INTO system_settings (id, maintenance_allowed_ips)
VALUES (1, JSON_ARRAY())
ON DUPLICATE KEY UPDATE id = id;

-- ---------------------------------------------------------------------------
--  Abonelik planları — mükellef ve mali müşavir için ayrı. Fiyatlar başlangıç
--  değerleridir; admin panelinden güncellenir. Sanal POS entegrasyonu gelene
--  kadar planlar yalnızca admin tarafından elle atanabilir.
-- ---------------------------------------------------------------------------
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
   CAST('["Sınırsız mükellef","60.000 evrak/ay","Luca içe/dışa aktarım","3.000 AI dijitalleştirme","Öncelikli destek"]' AS JSON));

-- ---------------------------------------------------------------------------
--  Test edilmemiş evrak türlerinin şema düzeltmeleri
--  (bkz. migration FixUntestedDocumentTypeSchemas — burada aynası tutuluyor)
--
--  * `dateField`: türde `documentDate` alanı yoksa documents.document_date bu
--    alandan doldurulur. Olmadan çek/ekstre/bordro/sigorta evraklarının tarihi
--    HER ZAMAN NULL kalıyor, tarih filtreleri onları sessizce dışarıda bırakıyordu.
--  * E-Bordro'da tutar `netSalary` anahtarındaydı; kanonik anahtar listesi sabit
--    olduğu için meta_amount'a hiç düşmüyor, listede tutar boş görünüyordu.
--  * Banka Ekstre'de açılış/kapanış bakiyesi zorunluydu — elde olmadığında evrak
--    hiç kaydedilemiyordu; isteğe bağlı yapıldı.
-- ---------------------------------------------------------------------------
UPDATE document_types SET metadata_schema = CAST('{"dateField":"issueDate","fields":[
    {"key":"documentNo","label":"Çek No","type":"string","required":true,"canonical":true},
    {"key":"issueDate","label":"Keşide Tarihi","type":"date","required":true},
    {"key":"dueDate","label":"Vade Tarihi","type":"date","required":true},
    {"key":"bank","label":"Banka","type":"string","required":true},
    {"key":"branch","label":"Şube","type":"string","required":false},
    {"key":"totalAmount","label":"Tutar","type":"decimal","required":true,"canonical":true},
    {"key":"counterpartyTitle","label":"Borçlu Unvanı","type":"string","required":true,"canonical":true},
    {"key":"vknTckn","label":"Borçlu VKN/TCKN","type":"string","required":false,"canonical":true}
]}' AS JSON) WHERE code = 'alinan_cek';

UPDATE document_types SET metadata_schema = CAST('{"dateField":"issueDate","fields":[
    {"key":"documentNo","label":"Çek No","type":"string","required":true,"canonical":true},
    {"key":"issueDate","label":"Keşide Tarihi","type":"date","required":true},
    {"key":"dueDate","label":"Vade Tarihi","type":"date","required":true},
    {"key":"bank","label":"Banka","type":"string","required":true},
    {"key":"branch","label":"Şube","type":"string","required":false},
    {"key":"totalAmount","label":"Tutar","type":"decimal","required":true,"canonical":true},
    {"key":"counterpartyTitle","label":"Alacaklı Unvanı","type":"string","required":true,"canonical":true},
    {"key":"vknTckn","label":"Alacaklı VKN/TCKN","type":"string","required":false,"canonical":true}
]}' AS JSON) WHERE code = 'verilen_cek';

UPDATE document_types SET metadata_schema = CAST('{"dateField":"periodEnd","fields":[
    {"key":"bankName","label":"Banka Adı","type":"string","required":true},
    {"key":"iban","label":"IBAN","type":"string","required":false},
    {"key":"periodStart","label":"Dönem Başlangıç","type":"date","required":true},
    {"key":"periodEnd","label":"Dönem Bitiş","type":"date","required":true},
    {"key":"openingBalance","label":"Başlangıç Bakiyesi","type":"decimal","required":false},
    {"key":"closingBalance","label":"Bitiş Bakiyesi","type":"decimal","required":false}
]}' AS JSON) WHERE code = 'banka_ekstre';

UPDATE document_types SET metadata_schema = CAST('{"dateField":"periodEnd","fields":[
    {"key":"personnelName","label":"Personel Ad-Soyad","type":"string","required":true},
    {"key":"personnelTc","label":"TC Kimlik No","type":"string","required":false},
    {"key":"period","label":"Dönem (Ay/Yıl)","type":"string","required":true},
    {"key":"periodEnd","label":"Dönem Bitiş Tarihi","type":"date","required":false},
    {"key":"totalAmount","label":"Net Ücret","type":"decimal","required":true,"canonical":true},
    {"key":"grossSalary","label":"Brüt Ücret","type":"decimal","required":false}
]}' AS JSON) WHERE code = 'e_bordro';

UPDATE document_types SET metadata_schema = CAST('{"dateField":"periodEnd","fields":[
    {"key":"docKind","label":"Belge Türü","type":"string","required":true},
    {"key":"period","label":"Dönem (Ay/Yıl)","type":"string","required":true},
    {"key":"periodEnd","label":"Dönem Bitiş Tarihi","type":"date","required":false},
    {"key":"sgkRegNo","label":"SGK Sicil No","type":"string","required":false},
    {"key":"totalAmount","label":"Toplam Tutar","type":"decimal","required":true,"canonical":true}
]}' AS JSON) WHERE code = 'sigorta';

UPDATE document_types SET metadata_schema = CAST('{"fields":[
    {"key":"documentNo","label":"Makbuz No","type":"string","required":true,"canonical":true},
    {"key":"documentDate","label":"Tarih","type":"date","required":true},
    {"key":"counterpartyTitle","label":"Cari Unvan","type":"string","required":true,"canonical":true},
    {"key":"vknTckn","label":"Cari VKN/TCKN","type":"string","required":false,"canonical":true},
    {"key":"totalAmount","label":"Tahsilat Tutarı","type":"decimal","required":true,"canonical":true},
    {"key":"txnType","label":"İşlem Türü","type":"enum","required":true,"options":["nakit","havale","eft"]}
]}' AS JSON) WHERE code = 'tahsilat_makbuzu';

UPDATE document_types SET metadata_schema = CAST('{"fields":[
    {"key":"documentNo","label":"Makbuz No","type":"string","required":true,"canonical":true},
    {"key":"documentDate","label":"Tarih","type":"date","required":true},
    {"key":"counterpartyTitle","label":"Cari Unvan","type":"string","required":true,"canonical":true},
    {"key":"vknTckn","label":"Cari VKN/TCKN","type":"string","required":false,"canonical":true},
    {"key":"totalAmount","label":"Tediye Tutarı","type":"decimal","required":true,"canonical":true},
    {"key":"txnType","label":"İşlem Türü","type":"enum","required":true,"options":["nakit","havale","eft"]}
]}' AS JSON) WHERE code = 'tediye_makbuzu';

UPDATE document_types SET metadata_schema = CAST('{"dateField":"documentDate","fields":[
    {"key":"period","label":"Dönem (Ay/Yıl)","type":"string","required":true},
    {"key":"documentDate","label":"Berat Tarihi","type":"date","required":false},
    {"key":"beratType","label":"Berat Türü","type":"enum","required":true,"options":["yevmiye","kebir"]},
    {"key":"documentNo","label":"Yevmiye Kontrol No","type":"string","required":false,"canonical":true}
]}' AS JSON) WHERE code = 'e_defter';

UPDATE document_types SET metadata_schema = CAST('{"fields":[
    {"key":"period","label":"Yıl","type":"string","required":false},
    {"key":"documentDate","label":"Tahakkuk/Belge Tarihi","type":"date","required":false},
    {"key":"vknTckn","label":"VKN","type":"string","required":false,"canonical":true}
]}' AS JSON) WHERE code = 'vergi_levhasi';
