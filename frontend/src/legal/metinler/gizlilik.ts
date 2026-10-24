import { FIRMA } from '../firma';
import type { YasalMetin } from '../tipler';

export const gizlilik: YasalMetin = {
  slug: 'gizlilik',
  baslik: 'Gizlilik Politikası',
  ozet: 'Verilerinizin nerede durduğunu, nasıl korunduğunu ve kimin erişebildiğini teknik olarak anlatır.',
  bolumler: [
    {
      baslik: 'Temel ilkelerimiz',
      maddeler: [
        'Verilerinizi satmayız, kiralamayız, reklam amacıyla üçüncü kişilerle paylaşmayız.',
        'Evraklarınızın içeriğini, hizmeti sunmak dışında bir amaçla incelemeyiz.',
        'Yalnızca hizmetin gerektirdiği veriyi toplarız; "belki lazım olur" diye veri istemeyiz.',
        'Yapay zekâ özelliği isteğe bağlıdır ve kapatılabilir.',
      ],
    },
    {
      baslik: 'Verileriniz nerede saklanıyor?',
      paragraflar: [
        'Hesap bilgileriniz, evrak üst verileri (tarih, tutar, tür gibi) ve işlem kayıtlarınız, erişimi kısıtlı bir sunucudaki veritabanında tutulur.',
        'Yüklediğiniz dosyaların kendisi (görüntü ve PDF) Google Cloud Storage üzerinde, herkese kapalı bir alanda saklanır. Dosyalara doğrudan bağlantıyla erişilemez; her erişim, oturumunuz ve yetkiniz doğrulandıktan sonra üretilen süreli bağlantılarla yapılır.',
        'Veritabanı yedekleri şifreli olarak ayrı bir konuma kopyalanır ve düzenli olarak alınır.',
      ],
    },
    {
      baslik: 'Kimler erişebilir?',
      maddeler: [
        'Siz ve yalnızca yetki verdiğiniz mali müşavir. Yetkiyi dilediğiniz zaman kaldırabilirsiniz; kaldırdığınız anda müşavirin erişimi sona erer.',
        'Sistem yöneticilerimiz, yalnızca destek talebiniz veya teknik arıza durumunda, gerektiği ölçüde. Bu erişimler denetim kayıtlarına (audit log) yazılır.',
        'Kanunen yetkili kamu kurumları, usulüne uygun talep üzerine.',
      ],
    },
    {
      baslik: 'Aldığımız teknik önlemler',
      maddeler: [
        'Tüm trafik TLS (HTTPS) ile şifrelenir.',
        'Parolalar geri döndürülemez biçimde özetlenerek (hash) saklanır; düz metin parola tutulmaz ve tarafımızca görülemez.',
        'Yetkisiz erişim denemelerine karşı hız sınırlaması ve oturum kısıtları uygulanır.',
        'Uygulama içi işlemler için denetim izi tutulur; kimin neyi ne zaman değiştirdiği kayıt altındadır.',
        'Rol bazlı yetkilendirme: her kullanıcı yalnızca kendi verisine ve kendisine yetki verilmiş mükelleflerin verisine erişebilir.',
      ],
    },
    {
      baslik: 'Veri ihlali durumunda',
      paragraflar: [
        'Kişisel verilerinizin hukuka aykırı olarak erişildiğini tespit etmemiz hâlinde, KVKK m.12/5 uyarınca en kısa sürede ve her hâlükârda 72 saat içinde Kişisel Verileri Koruma Kurulu\'na, gecikmeksizin de ilgili kişilere bildirim yapılır.',
      ],
    },
    {
      baslik: 'Hesabınızı silmek isterseniz',
      paragraflar: [
        `Hesap silme talebinizi Ayarlar sayfasından veya ${FIRMA.iletisimEposta} adresinden iletebilirsiniz. Talebiniz üzerine hesabınız kapatılır; kanunen saklanması zorunlu kayıtlar dışındaki verileriniz silinir. Evraklarınızı silmeden önce dışa aktarabilirsiniz.`,
      ],
    },
    {
      baslik: 'İletişim',
      paragraflar: [
        `Gizlilikle ilgili her türlü soru ve talebiniz için: ${FIRMA.iletisimEposta}. Kişisel verilerinize ilişkin yasal haklarınızın ayrıntısı için KVKK Aydınlatma Metni'ni inceleyebilirsiniz.`,
      ],
    },
  ],
};
