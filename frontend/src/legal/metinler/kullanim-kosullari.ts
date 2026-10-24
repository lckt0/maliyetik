import { FIRMA } from '../firma';
import type { YasalMetin } from '../tipler';

export const kullanimKosullari: YasalMetin = {
  slug: 'kullanim-kosullari',
  baslik: 'Kullanım Koşulları ve Üyelik Sözleşmesi',
  ozet: 'Hizmeti kullanırken tarafların hak ve yükümlülükleri.',
  bolumler: [
    {
      baslik: '1. Taraflar ve Konu',
      paragraflar: [
        `Bu sözleşme, ${FIRMA.unvan} ("${FIRMA.kisaAd}") ile ${FIRMA.alanAdi} üzerinden hesap oluşturan kullanıcı ("Kullanıcı") arasında, hizmetin kullanım şartlarını düzenler. Hesap oluşturarak bu koşulları kabul etmiş sayılırsınız.`,
      ],
    },
    {
      baslik: '2. Hizmetin Tanımı',
      paragraflar: [
        'Maliyetik; mükelleflerin ve mali müşavirlerin mali evraklarını dijital ortamda saklamasına, düzenlemesine, raporlamasına ve birbirleriyle paylaşmasına imkân veren bulut tabanlı bir yazılım hizmetidir.',
      ],
      maddeler: [
        'Maliyetik bir mali müşavirlik, muhasebe veya mali danışmanlık hizmeti DEĞİLDİR; beyanname vermez, mali müşavirin yerine geçmez.',
        'Uygulamadaki hesaplama araçları ve yapay zekâ çıktıları bilgilendirme amaçlıdır; resmî beyan, mali müşavir görüşü veya hukuki danışmanlık yerine geçmez. Bunlara dayanarak alınan kararların sorumluluğu Kullanıcıya aittir.',
        'Yapay zekâ ile yapılan otomatik okuma hatalı sonuç üretebilir. Verilerin doğruluğunu kontrol etmek Kullanıcının sorumluluğundadır.',
      ],
    },
    {
      baslik: '3. Hesap ve Güvenlik',
      maddeler: [
        'Kayıt sırasında verilen bilgilerin doğru ve güncel olması Kullanıcının sorumluluğundadır.',
        'Hesap parolasının gizliliğinden ve hesabı üzerinden yapılan tüm işlemlerden Kullanıcı sorumludur.',
        'Yetkisiz bir erişimden şüphelenmeniz hâlinde derhal parolanızı değiştirmeli ve bize bildirmelisiniz.',
        'Bir hesap, birden fazla kişi tarafından ortak kullanılmak üzere paylaşılamaz. Mali müşavir hesapları için ek kullanıcı ihtiyacı koltuk satın alınarak karşılanır.',
      ],
    },
    {
      baslik: '4. Kullanıcının Yükümlülükleri',
      maddeler: [
        'Sisteme yalnızca hukuka uygun şekilde elde edilmiş, kendisine veya yetkilendirildiği mükellefe ait evrakları yükleyebilir.',
        'Üçüncü kişilere ait kişisel veri içeren evrakların yüklenmesinde ilgili mevzuata uymak Kullanıcının sorumluluğundadır.',
        'Sisteme zarar verecek, aşırı yük oluşturacak, güvenlik önlemlerini aşmaya yönelik veya otomatik toplu erişim (bot, kazıma) niteliğindeki kullanımlar yasaktır.',
        'Hizmet, yeniden satılamaz, kiralanamaz veya üçüncü kişilerin erişimine açılamaz.',
        'Yasa dışı içerik, zararlı yazılım veya telif hakkını ihlal eden dosya yüklenemez.',
      ],
    },
    {
      baslik: '5. Kota, Koltuk ve Adil Kullanım',
      maddeler: [
        'Her abonelik planı belirli sayıda evrak saklama kapasitesi (kota) ve yapay zekâ dijitalleştirme hakkı içerir.',
        'Kota, sistemde duran evrak sayısını ifade eder; bir evrağı kalıcı olarak sildiğinizde kotanız iade edilir, çöp kutusuna taşımanız iade etmez.',
        'Mali müşavir planlarında kapasite, satın alınan koltuk sayısı üzerinden hesaplanır. Bir koltuk boşaldığında aynı abonelik döneminde başka bir mükellef için yeniden kullanılabilir.',
        'Kota aşımında yeni evrak yüklenemez; mevcut evraklarınıza erişiminiz devam eder.',
      ],
    },
    {
      baslik: '6. Ücretlendirme',
      maddeler: [
        'Abonelik ücretleri, güncel fiyat listesinde belirtilen tutarlar üzerinden peşin tahsil edilir.',
        'Fiyatlarda değişiklik yapılması hâlinde mevcut abonelik döneminiz etkilenmez; değişiklik yenileme döneminde geçerli olur.',
        'Otomatik yenileme uygulanmaz. Abonelik dönemi sona ermeden önce tarafınıza hatırlatma yapılır; yenilemezseniz hesabınız ücretsiz plan koşullarına döner.',
      ],
    },
    {
      baslik: '7. Fikri Mülkiyet',
      paragraflar: [
        `Uygulamanın yazılımı, tasarımı, markası ve içeriği ${FIRMA.kisaAd}'e aittir. Kullanıcı, abonelik süresince hizmeti kullanma hakkına sahiptir; bu hak devredilemez ve münhasır değildir.`,
        'Kullanıcının yüklediği evraklar ve içerdiği veriler Kullanıcıya aittir. Bu veriler üzerinde tarafımıza, yalnızca hizmeti sunmak için gerekli olan işleme hakkı tanınmış olur.',
      ],
    },
    {
      baslik: '8. Hizmet Sürekliliği ve Sorumluluk Sınırı',
      maddeler: [
        'Hizmetin kesintisiz sunulması için makul çaba gösterilir; bakım, güncelleme veya sağlayıcı kaynaklı arızalarda geçici kesinti yaşanabilir. Planlı bakımlar önceden duyurulur.',
        'Mücbir sebep hâllerinde (doğal afet, siber saldırı, altyapı sağlayıcısı kaynaklı kesinti, mevzuat değişikliği vb.) doğan aksaklıklardan sorumluluk kabul edilmez.',
        'Sorumluluğumuz her hâlükârda, ilgili Kullanıcının son 12 ayda ödediği abonelik bedeli ile sınırlıdır. Dolaylı zararlar, kâr kaybı ve veri kaybından doğan dolaylı zararlar kapsam dışıdır.',
        'Verilerinizin düzenli yedeği alınır; ancak kendi kayıtlarınızı ayrıca saklamanız tavsiye edilir.',
      ],
    },
    {
      baslik: '9. Askıya Alma ve Fesih',
      maddeler: [
        'Bu koşulların ihlali hâlinde hesabınız uyarı yapılarak askıya alınabilir; ağır ihlallerde uyarı yapılmaksızın kapatılabilir.',
        'Kullanıcı dilediği zaman hesabını kapatabilir. Kapatma hâlinde kalan dönem için iade koşulları, İptal ve İade Koşulları metnine tabidir.',
        'Hesabın kapatılması hâlinde verilerinizi dışa aktarmanız için makul bir süre tanınır.',
      ],
    },
    {
      baslik: '10. Değişiklikler ve Uygulanacak Hukuk',
      paragraflar: [
        'Bu koşullarda yapılacak değişiklikler uygulama üzerinden duyurulur ve yayımlandığı tarihte yürürlüğe girer. Değişikliği kabul etmemeniz hâlinde hesabınızı kapatma hakkınız saklıdır.',
        'Bu sözleşmeye Türk hukuku uygulanır. Uyuşmazlıklarda tüketici işlemleri bakımından tüketicinin yerleşim yerindeki tüketici hakem heyetleri ve tüketici mahkemeleri; diğer hâllerde ' + FIRMA.adres + ' adresinin bulunduğu yer mahkemeleri ve icra daireleri yetkilidir.',
      ],
    },
  ],
};
