import { FIRMA } from '../firma';
import type { YasalMetin } from '../tipler';

export const acikRiza: YasalMetin = {
  slug: 'acik-riza',
  baslik: 'Açık Rıza Metni',
  ozet: 'Yalnızca onayınıza bağlı iki işlem: yurt dışına aktarım gerektiren yapay zekâ özelliği ve tanıtım iletileri.',
  bolumler: [
    {
      baslik: 'Neye rıza veriyorsunuz?',
      paragraflar: [
        `Hizmetin çalışması için zorunlu olan veri işleme faaliyetleri açık rızaya değil, sözleşmenin ifasına ve kanuni yükümlülüklere dayanır; bunlar için ayrıca onay istenmez. Aşağıdaki iki işlem ise yalnızca onay vermeniz hâlinde yapılır ve onayınızı dilediğiniz zaman geri alabilirsiniz.`,
      ],
    },
    {
      baslik: '1. Yapay zekâ ile evrak okuma ve yurt dışına aktarım',
      paragraflar: [
        'Evraklarınızı yapay zekâ ile otomatik okutmayı seçtiğinizde, ilgili evrağın görüntüsü veya PDF dosyası bu işlemi gerçekleştirmek üzere yurt dışında bulunan yapay zekâ hizmet sağlayıcısına (Google — Gemini API) aktarılır. Aktarım yalnızca dijitalleştirme talebiniz üzerine, o evrakla sınırlı olarak yapılır.',
        'KVKK m.9 kapsamında kişisel verilerimin bu amaçla yurt dışına aktarılmasına açık rıza veriyorum.',
      ],
      maddeler: [
        'Rıza vermezseniz: evraklarınızı yükleyip saklamaya, elle bilgi girmeye ve diğer tüm özellikleri kullanmaya devam edebilirsiniz; yalnızca otomatik okuma çalışmaz.',
        'Rızanızı Ayarlar sayfasından yapay zekâ özelliklerini kapatarak geri alabilirsiniz. Geri alma, o ana kadar yapılmış aktarımları etkilemez.',
      ],
    },
    {
      baslik: '2. Tanıtım ve bilgilendirme iletileri',
      paragraflar: [
        `${FIRMA.kisaAd} tarafından sunulan yeni özellikler, kampanyalar ve mevzuat bilgilendirmeleri hakkında tarafıma e-posta gönderilmesine açık rıza veriyorum.`,
      ],
      maddeler: [
        'Abonelik bitişi, kota uyarısı, güvenlik uyarısı ve fatura bildirimi gibi hizmetin işleyişine ilişkin zorunlu iletiler bu kapsamda değildir; bunlar rızaya bağlı olmaksızın gönderilir.',
        'Onayınızı her e-postanın altındaki bağlantıdan veya Ayarlar sayfasından geri alabilirsiniz.',
      ],
    },
    {
      baslik: 'Rızanın geri alınması',
      paragraflar: [
        `Açık rızanızı dilediğiniz zaman, gerekçe göstermeksizin geri alabilirsiniz. Geri alma talebinizi Ayarlar sayfasından veya ${FIRMA.iletisimEposta} adresine e-posta göndererek iletebilirsiniz. Rızanın geri alınması, geri alma tarihine kadar yapılmış işlemleri hukuka aykırı hâle getirmez.`,
      ],
    },
  ],
};
