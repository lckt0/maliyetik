import { FIRMA } from '../firma';
import type { YasalMetin } from '../tipler';

export const mesafeliSatis: YasalMetin = {
  slug: 'mesafeli-satis',
  baslik: 'Mesafeli Satış Sözleşmesi',
  ozet: 'Abonelik satın alırken kurulan sözleşmenin tarafları, konusu, bedeli ve cayma hakkı.',
  bolumler: [
    {
      baslik: '1. Taraflar',
      paragraflar: [
        `SATICI: ${FIRMA.unvan} · Adres: ${FIRMA.adres} · Vergi Dairesi/No: ${FIRMA.vergiDairesi} / ${FIRMA.vergiNo} · MERSİS: ${FIRMA.mersis} · KEP: ${FIRMA.kep} · Telefon: ${FIRMA.telefon} · E-posta: ${FIRMA.iletisimEposta}`,
        'ALICI: Sipariş sırasında hesabında kayıtlı bilgileri beyan eden kullanıcı. Alıcının ad-soyad/unvan, adres, e-posta ve telefon bilgileri sipariş kaydında yer alır.',
      ],
    },
    {
      baslik: '2. Sözleşmenin Konusu',
      paragraflar: [
        `İşbu sözleşmenin konusu, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri uyarınca, ALICI'nın ${FIRMA.siteUrl} üzerinden elektronik ortamda siparişini verdiği, aşağıda nitelikleri ve satış bedeli belirtilen dijital hizmet aboneliğine ilişkin tarafların hak ve yükümlülüklerinin belirlenmesidir.`,
      ],
    },
    {
      baslik: '3. Hizmetin Niteliği ve Bedeli',
      maddeler: [
        'Hizmet: Maliyetik bulut tabanlı mali evrak yönetim yazılımının, seçilen plan kapsamında ve süresince kullanım hakkı.',
        'Plan adı, süresi (yıllık), evrak/koltuk kapasitesi ve yapay zekâ hakkı, sipariş ekranında ve sipariş özetinde belirtilir.',
        'Satış bedeli, sipariş ekranında KDV dâhil olarak gösterilen tutardır. Sipariş özetinde yer alan tutar, ödeme öncesi ALICI tarafından onaylanır.',
        'Hizmet dijital olarak sunulduğundan kargo veya teslimat masrafı bulunmaz.',
      ],
    },
    {
      baslik: '4. Ödeme',
      maddeler: [
        'Ödeme, anlaşmalı ödeme kuruluşunun güvenli ödeme sayfası üzerinden kredi kartı/banka kartı ile peşin olarak yapılır.',
        'Kart bilgileri SATICI tarafından görülmez, kaydedilmez ve saklanmaz.',
        'Ödemenin onaylanmaması hâlinde sözleşme kurulmamış sayılır ve hizmet aktive edilmez.',
      ],
    },
    {
      baslik: '5. İfa ve Teslim',
      maddeler: [
        'Hizmet, ödemenin onaylanmasının ardından ALICI\'nın hesabında derhal aktive edilir; ayrı bir teslimat süreci yoktur.',
        'Abonelik süresi, aktivasyon tarihinde başlar ve seçilen plan süresinin sonunda kendiliğinden sona erer. Otomatik yenileme yapılmaz.',
        'Aktivasyonun teknik bir nedenle gerçekleşmemesi hâlinde ALICI, ödediği bedelin iadesini talep edebilir.',
      ],
    },
    {
      baslik: '6. Cayma Hakkı',
      paragraflar: [
        'Mesafeli Sözleşmeler Yönetmeliği m.15/1-ğ uyarınca, elektronik ortamda anında ifa edilen ve tüketiciye anında teslim edilen gayrimaddi mallara ilişkin sözleşmelerde cayma hakkı bulunmamaktadır.',
        'Bu nedenle, ALICI\'nın onayıyla hizmetin derhal aktive edilmesi hâlinde 14 günlük cayma hakkı sona erer. ALICI, sipariş sırasında bu durumu ayrıca onaylar.',
      ],
      maddeler: [
        'Buna rağmen, hizmetin hiç kullanılmamış olması hâlinde uygulanan iyi niyet iadesi için İptal ve İade Koşulları metnine bakınız.',
      ],
    },
    {
      baslik: '7. Uyuşmazlık Çözümü',
      paragraflar: [
        'ALICI, şikâyet ve itirazlarını, Ticaret Bakanlığı tarafından her yıl ilan edilen parasal sınırlar dâhilinde, malı satın aldığı veya ikametgâhının bulunduğu yerdeki Tüketici Hakem Heyetine veya Tüketici Mahkemesine yapabilir.',
        'İşbu sözleşme elektronik ortamda ALICI tarafından okunup kabul edilmek suretiyle kurulmuştur ve bir örneği ALICI\'nın hesabında saklanır.',
      ],
    },
  ],
};
