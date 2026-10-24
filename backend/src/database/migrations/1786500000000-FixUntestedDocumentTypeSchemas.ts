import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Üzerinde hiç çalışılmamış evrak türlerinin şema kusurlarını giderir.
 *
 * Gerçek kullanımı olan türler (e-Arşiv, e-Fatura, Z-Raporu, Mali Hafıza Raporu,
 * Vergi Levhası) test edilip düzeltilmişti; kalan türlerin şemaları hiç denenmemişti.
 * Uçtan uca gözden geçirmede bulunan somut kusurlar:
 *
 *  1) TARİHSİZ EVRAKLAR — Alınan/Verilen Çek, Banka Ekstre, E-Bordro ve Sigorta
 *     şemalarında `documentDate` adında bir alan yok; `documents.document_date`
 *     bu türlerde HER ZAMAN NULL kalıyordu. Sonuç: tarih aralığı filtresi bu
 *     evrakları sessizce dışarıda bırakıyor, tarihe göre sıralama/raporlama
 *     çalışmıyordu. Yeni `dateField` şema anahtarıyla tarih ilgili alandan türetiliyor
 *     (çekte keşide tarihi, ekstre/bordro/sigortada dönem bitişi).
 *
 *  2) LİSTEDE TUTAR GÖRÜNMEYEN TÜR — E-Bordro'da tutar `netSalary` anahtarındaydı;
 *     kanonik anahtar listesi sabit olduğu için (bkz. CANONICAL_META_KEYS) bu alan
 *     `meta_amount` kolonuna hiç düşmüyor, listede ve raporlarda tutar boş görünüyordu.
 *     `totalAmount` ("Net Ücret") olarak değiştirildi, brüt ücret ayrı alan kaldı.
 *
 *  3) GEREKSİZ ZORUNLU ALANLAR — Banka Ekstre'de açılış/kapanış bakiyesi zorunluydu;
 *     elde her zaman bulunmayan bu iki alan yüzünden evrak hiç kaydedilemiyordu.
 *     İsteğe bağlı yapıldı. Sigorta'da SGK sicil no ve bordroda TC de aynı şekilde.
 *
 * Bu türler henüz kullanılmadığından anahtar değişimi için veri taşıma yapılmaz.
 */
export class FixUntestedDocumentTypeSchemas1786500000000 implements MigrationInterface {
  name = 'FixUntestedDocumentTypeSchemas1786500000000';

  private async setSchema(q: QueryRunner, code: string, schema: unknown): Promise<void> {
    await q.query('UPDATE document_types SET metadata_schema = CAST(? AS JSON) WHERE code = ?', [
      JSON.stringify(schema), code,
    ]);
  }

  public async up(q: QueryRunner): Promise<void> {
    await this.setSchema(q, 'alinan_cek', {
      dateField: 'issueDate',
      fields: [
        { key: 'documentNo', label: 'Çek No', type: 'string', required: true, canonical: true },
        { key: 'issueDate', label: 'Keşide Tarihi', type: 'date', required: true },
        { key: 'dueDate', label: 'Vade Tarihi', type: 'date', required: true },
        { key: 'bank', label: 'Banka', type: 'string', required: true },
        { key: 'branch', label: 'Şube', type: 'string', required: false },
        { key: 'totalAmount', label: 'Tutar', type: 'decimal', required: true, canonical: true },
        { key: 'counterpartyTitle', label: 'Borçlu Unvanı', type: 'string', required: true, canonical: true },
        { key: 'vknTckn', label: 'Borçlu VKN/TCKN', type: 'string', required: false, canonical: true },
      ],
    });

    await this.setSchema(q, 'verilen_cek', {
      dateField: 'issueDate',
      fields: [
        { key: 'documentNo', label: 'Çek No', type: 'string', required: true, canonical: true },
        { key: 'issueDate', label: 'Keşide Tarihi', type: 'date', required: true },
        { key: 'dueDate', label: 'Vade Tarihi', type: 'date', required: true },
        { key: 'bank', label: 'Banka', type: 'string', required: true },
        { key: 'branch', label: 'Şube', type: 'string', required: false },
        { key: 'totalAmount', label: 'Tutar', type: 'decimal', required: true, canonical: true },
        { key: 'counterpartyTitle', label: 'Alacaklı Unvanı', type: 'string', required: true, canonical: true },
        { key: 'vknTckn', label: 'Alacaklı VKN/TCKN', type: 'string', required: false, canonical: true },
      ],
    });

    await this.setSchema(q, 'banka_ekstre', {
      dateField: 'periodEnd',
      fields: [
        { key: 'bankName', label: 'Banka Adı', type: 'string', required: true },
        { key: 'iban', label: 'IBAN', type: 'string', required: false },
        { key: 'periodStart', label: 'Dönem Başlangıç', type: 'date', required: true },
        { key: 'periodEnd', label: 'Dönem Bitiş', type: 'date', required: true },
        { key: 'openingBalance', label: 'Başlangıç Bakiyesi', type: 'decimal', required: false },
        { key: 'closingBalance', label: 'Bitiş Bakiyesi', type: 'decimal', required: false },
      ],
    });

    await this.setSchema(q, 'e_bordro', {
      dateField: 'periodEnd',
      fields: [
        { key: 'personnelName', label: 'Personel Ad-Soyad', type: 'string', required: true },
        { key: 'personnelTc', label: 'TC Kimlik No', type: 'string', required: false },
        { key: 'period', label: 'Dönem (Ay/Yıl)', type: 'string', required: true },
        { key: 'periodEnd', label: 'Dönem Bitiş Tarihi', type: 'date', required: false },
        { key: 'totalAmount', label: 'Net Ücret', type: 'decimal', required: true, canonical: true },
        { key: 'grossSalary', label: 'Brüt Ücret', type: 'decimal', required: false },
      ],
    });

    await this.setSchema(q, 'sigorta', {
      dateField: 'periodEnd',
      fields: [
        { key: 'docKind', label: 'Belge Türü', type: 'string', required: true },
        { key: 'period', label: 'Dönem (Ay/Yıl)', type: 'string', required: true },
        { key: 'periodEnd', label: 'Dönem Bitiş Tarihi', type: 'date', required: false },
        { key: 'sgkRegNo', label: 'SGK Sicil No', type: 'string', required: false },
        { key: 'totalAmount', label: 'Toplam Tutar', type: 'decimal', required: true, canonical: true },
      ],
    });

    // Makbuzlarda karşı tarafın VKN'si listede/filtrede kullanılabilsin (kanonik).
    for (const code of ['tahsilat_makbuzu', 'tediye_makbuzu']) {
      const label = code === 'tahsilat_makbuzu' ? 'Tahsilat' : 'Tediye';
      await this.setSchema(q, code, {
        fields: [
          { key: 'documentNo', label: 'Makbuz No', type: 'string', required: true, canonical: true },
          { key: 'documentDate', label: 'Tarih', type: 'date', required: true },
          { key: 'counterpartyTitle', label: 'Cari Unvan', type: 'string', required: true, canonical: true },
          { key: 'vknTckn', label: 'Cari VKN/TCKN', type: 'string', required: false, canonical: true },
          { key: 'totalAmount', label: `${label} Tutarı`, type: 'decimal', required: true, canonical: true },
          { key: 'txnType', label: 'İşlem Türü', type: 'enum', required: true, options: ['nakit', 'havale', 'eft'] },
        ],
      });
    }

    // Vergi Levhası tek "Yıl" alanıyla geliyordu; tarih kolonu boş kaldığı için
    // şirket evrakları tarihe göre sıralanamıyordu.
    await this.setSchema(q, 'vergi_levhasi', {
      fields: [
        { key: 'period', label: 'Yıl', type: 'string', required: false },
        { key: 'documentDate', label: 'Tahakkuk/Belge Tarihi', type: 'date', required: false },
        { key: 'vknTckn', label: 'VKN', type: 'string', required: false, canonical: true },
      ],
    });

    // E-Defter: berat tarihi doldurulduğunda document_date'e yansısın.
    await this.setSchema(q, 'e_defter', {
      dateField: 'documentDate',
      fields: [
        { key: 'period', label: 'Dönem (Ay/Yıl)', type: 'string', required: true },
        { key: 'documentDate', label: 'Berat Tarihi', type: 'date', required: false },
        { key: 'beratType', label: 'Berat Türü', type: 'enum', required: true, options: ['yevmiye', 'kebir'] },
        { key: 'documentNo', label: 'Yevmiye Kontrol No', type: 'string', required: false, canonical: true },
      ],
    });
  }

  public async down(): Promise<void> {
    // Şema geri alma bilinçli olarak yok: eski şemalar tarih/tutar kusurları
    // taşıyordu, geri dönmek düzeltme değil gerileme olurdu.
  }
}
