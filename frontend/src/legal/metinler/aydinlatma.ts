import { FIRMA } from '../firma';
import type { YasalMetin } from '../tipler';

export const aydinlatma: YasalMetin = {
  slug: 'aydinlatma',
  baslik: 'KVKK Aydınlatma Metni',
  ozet: 'Kişisel verilerinizi hangi amaçla işlediğimizi, kimlerle paylaştığımızı ve haklarınızı anlatır.',
  bolumler: [
    {
      baslik: '1. Veri Sorumlusu',
      paragraflar: [
        `6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca kişisel verileriniz, veri sorumlusu sıfatıyla ${FIRMA.unvan} ("${FIRMA.kisaAd}", "biz") tarafından aşağıda açıklanan kapsamda işlenmektedir.`,
        `Adres: ${FIRMA.adres} · Vergi Dairesi/No: ${FIRMA.vergiDairesi} / ${FIRMA.vergiNo} · MERSİS: ${FIRMA.mersis} · KEP: ${FIRMA.kep} · E-posta: ${FIRMA.iletisimEposta}`,
      ],
    },
    {
      baslik: '2. İşlenen Kişisel Veriler',
      paragraflar: [
        'Hizmetin niteliği gereği yalnızca aşağıdaki veriler işlenir. Bu listede yer almayan bir veri kategorisi talep edilmez.',
      ],
      tablo: {
        basliklar: ['Kategori', 'Veriler'],
        satirlar: [
          ['Kimlik', 'Ad soyad, T.C. kimlik numarası veya vergi kimlik numarası, ticari unvan, bağlı bulunulan vergi dairesi'],
          ['İletişim', 'E-posta adresi, telefon numarası, şehir'],
          ['Mesleki bilgi (mali müşavirler için)', 'Ruhsat numarası, ofis adı, kullanıcı adı ve isteğe bağlı herkese açık profil bilgileri'],
          ['Müşteri işlem', 'Sisteme yüklenen mali evrakların görüntüleri/PDF dosyaları ve bu evraklardan çıkarılan alanlar (tarih, tutar, KDV, karşı taraf unvanı, belge numarası), evrak notları, hatırlatıcılar'],
          ['İşlem güvenliği', 'IP adresi, oturum ve cihaz kayıtları, giriş zamanları, sistem log kayıtları, denetim izi (audit log)'],
          ['Finans', 'Abonelik ve ödeme kayıtları, fatura bilgileri, satın alınan paket ve kota bilgileri'],
        ],
      },
      maddeler: [
        'Kredi kartı ve banka kartı bilgileriniz sistemimize hiçbir aşamada girilmez ve tarafımızca saklanmaz; ödeme, ödeme kuruluşunun kendi güvenli sayfasında tamamlanır.',
        'Sisteme yüklediğiniz evraklar üçüncü kişilere ait kişisel veriler içerebilir (örneğin bir faturadaki karşı tarafın bilgileri). Bu verilerin hukuka uygun şekilde toplanmasından ve sisteme yüklenmesinden, verileri yükleyen kullanıcı sorumludur.',
      ],
    },
    {
      baslik: '3. İşleme Amaçları ve Hukuki Sebepleri',
      tablo: {
        basliklar: ['Amaç', 'Hukuki sebep (KVKK m.5)'],
        satirlar: [
          ['Üyelik oluşturma, kimlik doğrulama, hizmete erişim sağlanması', 'Sözleşmenin kurulması ve ifası (m.5/2-c)'],
          ['Mali evrakların saklanması, dijitalleştirilmesi ve raporlanması', 'Sözleşmenin ifası (m.5/2-c)'],
          ['Mali müşavir–mükellef yetkilendirmesi ve evrak paylaşımı', 'Sözleşmenin ifası (m.5/2-c), ilgili kişinin talebi'],
          ['Abonelik, ödeme, faturalama ve muhasebe kayıtları', 'Hukuki yükümlülük (m.5/2-ç)'],
          ['Sistem güvenliği, kötüye kullanımın önlenmesi, log tutulması', 'Meşru menfaat (m.5/2-f), hukuki yükümlülük'],
          ['Hizmete ilişkin zorunlu bildirimler (abonelik bitişi, kota uyarısı, güvenlik uyarısı)', 'Sözleşmenin ifası (m.5/2-c)'],
          ['Tanıtım ve bilgilendirme iletileri gönderilmesi', 'Açık rıza (m.5/1) — ayrıca onaylamadıkça gönderilmez'],
          ['Yapay zekâ ile evrak okuma (isteğe bağlı özellik)', 'Sözleşmenin ifası (m.5/2-c); yurt dışına aktarım için açık rıza'],
        ],
      },
    },
    {
      baslik: '4. Verilerin Aktarıldığı Taraflar',
      paragraflar: [
        'Kişisel verileriniz, hizmetin sunulabilmesi için yalnızca aşağıdaki hizmet sağlayıcılara, hizmetin gerektirdiği ölçüde aktarılır. Verileriniz pazarlama amacıyla üçüncü kişilere satılmaz veya devredilmez.',
      ],
      tablo: {
        basliklar: ['Alıcı', 'Amaç', 'Konum'],
        satirlar: [
          ['Google Cloud Storage', 'Yüklenen evrakların saklanması', 'Yurt dışı'],
          ['Google (Gemini API)', 'Yapay zekâ ile evrak okuma — yalnızca bu özelliği kullandığınızda', 'Yurt dışı'],
          ['Brevo (e-posta altyapısı)', 'Doğrulama, bildirim ve hatırlatma e-postaları', 'Avrupa Birliği'],
          ['Shopier (ödeme kuruluşu)', 'Abonelik ödemelerinin tahsili', 'Türkiye'],
          ['Sunucu barındırma sağlayıcısı', 'Uygulamanın ve veritabanının çalıştırılması', 'Türkiye / Avrupa Birliği'],
          ['Yetkili kamu kurum ve kuruluşları', 'Kanunen zorunlu hâllerde talep üzerine', 'Türkiye'],
          ['Yetkilendirdiğiniz mali müşavir', 'Yalnızca sizin verdiğiniz yetki kapsamında', 'Türkiye'],
        ],
      },
      maddeler: [
        'Yurt dışına aktarım KVKK m.9 kapsamında, açık rızanız veya Kanunda öngörülen diğer şartlar çerçevesinde yapılır.',
        'Yapay zekâ özelliğini kullanmamayı seçerseniz evraklarınız yapay zekâ sağlayıcısına hiçbir şekilde gönderilmez.',
      ],
    },
    {
      baslik: '5. Toplama Yöntemi',
      paragraflar: [
        'Kişisel verileriniz; web sitesi ve mobil uygulama üzerinden doldurduğunuz formlar, yüklediğiniz dosyalar, mali müşavirinizin sizin adınıza yaptığı işlemler ve sistemin otomatik olarak ürettiği log kayıtları aracılığıyla, kısmen otomatik yollarla toplanır.',
      ],
    },
    {
      baslik: '6. Saklama Süreleri',
      tablo: {
        basliklar: ['Veri', 'Süre'],
        satirlar: [
          ['Mali evraklar ve içerdikleri veriler', 'Vergi Usul Kanunu uyarınca ilgili yılı takip eden takvim yılından itibaren 5 yıl; Türk Ticaret Kanunu kapsamındaki belgeler için 10 yıl'],
          ['Üyelik ve hesap bilgileri', 'Üyelik süresince ve sona ermesinden itibaren 10 yıl (zamanaşımı süreleri)'],
          ['Ödeme ve fatura kayıtları', '10 yıl'],
          ['Sistem log ve denetim kayıtları', '2 yıl'],
          ['Açık rızaya dayalı iletişim izni', 'Rızanın geri alınmasına kadar'],
        ],
      },
      paragraflar: [
        'Süre sona erdiğinde veriler silinir, yok edilir veya anonim hâle getirilir. Hesabınızı silmeniz durumunda, yukarıdaki kanuni saklama süreleri boyunca saklanması zorunlu olan kayıtlar erişime kapatılarak muhafaza edilir.',
      ],
    },
    {
      baslik: '7. Haklarınız',
      paragraflar: ['KVKK m.11 uyarınca veri sorumlusuna başvurarak şu haklara sahipsiniz:'],
      maddeler: [
        'Kişisel verinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme,',
        'İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,',
        'Yurt içinde veya yurt dışında verilerin aktarıldığı üçüncü kişileri bilme,',
        'Eksik veya yanlış işlenmiş olması hâlinde düzeltilmesini isteme,',
        'Kanunda öngörülen şartlar çerçevesinde silinmesini veya yok edilmesini isteme,',
        'Düzeltme, silme ve yok etme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,',
        'Münhasıran otomatik sistemlerle analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme,',
        'Kanuna aykırı işleme sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme.',
      ],
    },
    {
      baslik: '8. Başvuru',
      paragraflar: [
        `Taleplerinizi, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ'e uygun olarak ${FIRMA.iletisimEposta} adresine sistemde kayıtlı e-posta adresinizden, ${FIRMA.kep} KEP adresine veya ${FIRMA.adres} adresine yazılı olarak iletebilirsiniz. Başvurunuz en geç 30 gün içinde sonuçlandırılır.`,
      ],
    },
  ],
};
