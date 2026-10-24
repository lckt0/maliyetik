import { FIRMA } from '../firma';
import type { YasalMetin } from '../tipler';

export const iptalIade: YasalMetin = {
  slug: 'iptal-iade',
  baslik: 'İptal ve İade Koşulları',
  ozet: 'Aboneliğinizi nasıl iptal edeceğiniz ve hangi hâllerde iade yapıldığı.',
  bolumler: [
    {
      baslik: 'Aboneliğin iptali',
      maddeler: [
        'Aboneliğinizi dilediğiniz zaman Abonelik sayfasından iptal edebilirsiniz. İptal, mevcut dönemin sonunda geçerli olur; dönem sonuna kadar hizmeti kullanmaya devam edersiniz.',
        'Otomatik yenileme uygulanmadığı için "iptal etmeyi unutup yeniden ücretlendirilme" durumu oluşmaz. Dönem bitiminde hesabınız kendiliğinden ücretsiz plana döner.',
      ],
    },
    {
      baslik: 'İade koşulları',
      maddeler: [
        'Dijital hizmet anında ifa edildiğinden, kullanılmaya başlanmış aboneliklerde kural olarak iade yapılmaz (bkz. Mesafeli Satış Sözleşmesi m.6).',
        'İyi niyet iadesi: Satın alma tarihinden itibaren 14 gün içinde, abonelikle gelen hakları hiç kullanmadıysanız (yeni evrak yüklenmemiş, yapay zekâ hakkı harcanmamış, ek koltuk kullanılmamışsa) bedelin tamamı iade edilir.',
        'Teknik arıza nedeniyle hizmete erişemediğiniz ve sorunun makul sürede giderilemediği hâllerde, kullanılmayan döneme ilişkin bedel oranlanarak iade edilir.',
        'Yanlışlıkla yapılan mükerrer ödemeler, tespit edildiğinde talep beklenmeksizin iade edilir.',
      ],
    },
    {
      baslik: 'İade süreci',
      paragraflar: [
        `İade talebinizi ${FIRMA.iletisimEposta} adresine, ödeme yaptığınız hesabın e-posta adresinden iletiniz. Talebiniz en geç 14 gün içinde sonuçlandırılır ve iade, ödemenin yapıldığı karta yapılır. Bankaya bağlı olarak tutarın kartınıza yansıması birkaç iş günü sürebilir.`,
      ],
    },
    {
      baslik: 'Ödemesi görünmeyen işlemler',
      paragraflar: [
        `Ödemeniz bankanızdan geçtiği hâlde hesabınıza yansımadıysa, ödeme kuruluşundan dönüş bilgisi ulaşmamış olabilir. Bu durumda ${FIRMA.iletisimEposta} adresine işlem tarihi ve tutarını bildirmeniz yeterlidir; kayıt eşleştirilerek aboneliğiniz elle aktive edilir veya bedel iade edilir.`,
      ],
    },
  ],
};
