import { FIRMA } from '../firma';
import type { YasalMetin } from '../tipler';

export const cerez: YasalMetin = {
  slug: 'cerez',
  baslik: 'Çerez Politikası',
  ozet: 'Reklam veya analiz çerezi kullanmıyoruz; yalnızca oturumun açık kalması için tarayıcı depolaması kullanılıyor.',
  bolumler: [
    {
      baslik: 'Özet',
      paragraflar: [
        `${FIRMA.alanAdi} üzerinde reklam çerezi, izleme pikseli veya üçüncü taraf analiz aracı (Google Analytics, Meta Pixel vb.) KULLANILMAMAKTADIR. Bu nedenle karşınıza çerez onay penceresi çıkmaz.`,
        'Hizmetin çalışabilmesi için tarayıcınızın yerel depolama alanları (localStorage ve sessionStorage) kullanılır. Bunlar sunucuya kendiliğinden gönderilmez ve yalnızca sizin cihazınızda kalır.',
      ],
    },
    {
      baslik: 'Kullanılan depolama kalemleri',
      tablo: {
        basliklar: ['Kalem', 'Amaç', 'Tür', 'Süre'],
        satirlar: [
          ['Oturum anahtarları (accessToken / refreshToken)', 'Her sayfada yeniden giriş yapmanızı önlemek', 'Zorunlu', 'Çıkış yapana kadar'],
          ['Kullanıcı ve arayüz tercihleri', 'Tema, yoğunluk, satır sayısı, açık paneller gibi seçimlerinizi hatırlamak', 'Zorunlu (işlevsel)', 'Siz değiştirene kadar'],
          ['Seçili mükellef (sekme başına)', 'Aynı anda birden çok mükellefle çalışabilmeniz', 'Zorunlu (işlevsel)', 'Sekme kapanınca'],
          ['Servis çalışanı önbelleği', 'Mobil uygulamanın çevrimdışı açılabilmesi', 'Zorunlu (işlevsel)', 'Uygulama verisi silinene kadar'],
        ],
      },
    },
    {
      baslik: 'Nasıl temizlenir?',
      paragraflar: [
        'Uygulamadan çıkış yaptığınızda oturum anahtarları silinir. Tüm kalemleri tarayıcınızın ayarlarından site verilerini temizleyerek de kaldırabilirsiniz. Bu durumda tercihleriniz sıfırlanır ve yeniden giriş yapmanız gerekir.',
        'Zorunlu depolama kalemlerini engellerseniz uygulama çalışmaz; bu kalemler hizmetin sunulması için teknik zorunluluktur.',
      ],
    },
    {
      baslik: 'Değişiklikler',
      paragraflar: [
        `İleride analiz veya pazarlama amaçlı bir araç eklenirse bu politika güncellenir ve gerekli hâllerde onayınız ayrıca istenir. Sorularınız için: ${FIRMA.iletisimEposta}`,
      ],
    },
  ],
};
