import { ReactNode } from 'react';
import { Role } from './types';
import {
  BuildingIcon, ClockIcon, ExportIcon, FolderIcon, GaugeIcon, HomeIcon, LayersIcon,
  MegaphoneIcon, PercentIcon, ScanIcon, SettingsIcon, SparkleIcon, TrashIcon, UploadIcon,
  UserIcon, UsersIcon, WalletIcon,
} from './components/Icons';

export interface NavLeaf { to: string; label: string; end?: boolean; icon: ReactNode; }

/**
 * Kenar çubuğu kategorisi: silik bir başlık + çizgi, altında o kategorinin sayfaları.
 *
 * Açılır (dropdown) grup DEĞİL. Açılır grupta menünün
 * yarısı kapalı duruyordu; bir sayfaya gitmek için önce grubu açmak gerekiyordu.
 * Kategoriler yalnızca ayırıcıdır — her sayfa her zaman tek tıkla erişilebilir kalır.
 * Daraltılmış (ikon-only) modda başlık gizlenir, geriye kategorileri ayıran çizgi kalır.
 */
export interface NavSection { label: string; items: NavLeaf[]; }

/**
 * Rol bazlı menü.
 *
 * Mükellef ve müşavir menüleri bilerek FARKLI kurgulanmıştır: önceden ikisi
 * neredeyse birebir aynıydı ve mükellef, günlük işine yaramayan araçların (çift evrak
 * taraması, evrak logları) arasında kayboluyordu. Mükellefte günlük iş akışı (yükle →
 * tamamla → görüntüle) üstte ve ileri araçlar tek kategoride toplu; müşavirde mükellefler
 * arası çalışma ve Luca akışları öne çıkarıldı.
 *
 * NOT: Bu tanımlar Layout'tan buraya taşındı çünkü SEKME ŞERİDİ de aynı listeden
 * besleniyor (bkz. pageIdentityFor / tabs.tsx). Henüz mount edilmemiş bir sekmenin
 * başlığını yazabilmek için sayfa adlarının tek bir kaynakta durması gerekiyordu;
 * ikinci bir yol→ad sözlüğü tutulsaydı menü değiştiğinde sessizce eskirdi.
 */

/**
 * Müşavirin OFİS sekmesi menüsü — mükellef bağlamı olmayan sekme.
 *
 * Mükellef bazlı sayfalar bilerek YOK: onlar ancak o mükellefin kendi sekmesinde
 * açılır (bkz. components/TaxpayerScoped.tsx). Menüde
 * durup tıklandığında "burada olmaz" demek, hiç göstermemekten daha kötü bir deneyim
 * olurdu — ofis sekmesinde yalnızca ofis işleri görünür.
 */
export const ACCOUNTANT_OFFICE_NAV: NavSection[] = [
  {
    label: 'Ofis',
    items: [
      { to: '/musavir', label: 'Mükellef Panosu', end: true, icon: <HomeIcon /> },
      { to: '/musavir/mukellefler', label: 'Mükelleflerim', icon: <UsersIcon /> },
    ],
  },
  {
    label: 'Hesabım',
    items: [
      { to: '/abonelik', label: 'Hesap & Kullanım', icon: <WalletIcon /> },
    ],
  },
];

export const NAV: Record<Role, NavSection[]> = {
  taxpayer: [
    {
      label: 'Genel',
      items: [
        { to: '/mukellef', label: 'Anasayfa', end: true, icon: <HomeIcon /> },
      ],
    },
    {
      label: 'Evrak',
      items: [
        { to: '/mukellef/yukle', label: 'Evrak Yükle', icon: <UploadIcon /> },
        { to: '/mukellef/dijitallestir', label: 'Evrak Dijitalleştir', icon: <ScanIcon /> },
        { to: '/mukellef/evraklar', label: 'Evraklarım', icon: <FolderIcon /> },
        { to: '/mukellef/sirket', label: 'Şirket Evraklarım', icon: <BuildingIcon /> },
      ],
    },
    {
      label: 'Araçlar',
      items: [
        { to: '/mukellef/kdv', label: 'KDV Hesaplama', icon: <PercentIcon /> },
        { to: '/mukellef/cift-evrak', label: 'Çift Evrak Kontrolü', icon: <LayersIcon /> },
        { to: '/mukellef/loglar', label: 'Evrak Geçmişi', icon: <ClockIcon /> },
        { to: '/mukellef/cop-kutusu', label: 'Çöp Kutusu', icon: <TrashIcon /> },
      ],
    },
    {
      label: 'Hesabım',
      items: [
        { to: '/mukellef/musavir', label: 'Mali Müşavirim', icon: <UserIcon /> },
        { to: '/abonelik', label: 'Hesap & Kullanım', icon: <WalletIcon /> },
      ],
    },
  ],
  /**
   * Müşavirin MÜKELLEF sekmesi menüsü.
   *
   * Menüde önce o mükellefle yapılan işler gelir; müşavirin KENDİ hesabına ait sayfalar
   * (ofis panosu, mükellef listesi, abonelik/kullanım) "Mali Müşavir" kategorisinde
   * toplanır. Mükellef sekmesinin işi o mükellefin
   * evrakıdır; kendi hesabı arada bir bakılan bir yer olduğu için menünün başını
   * meşgul etmesin. Ofis sekmesinde bu ayrım gereksiz — orada zaten hepsi kendi işidir
   * (bkz. ACCOUNTANT_OFFICE_NAV).
   */
  accountant: [
    {
      label: 'Evrak',
      items: [
        { to: '/musavir/yukle', label: 'Evrak Yükle & İçe Aktar', icon: <UploadIcon /> },
        { to: '/musavir/dijitallestir', label: 'Evrak Dijitalleştir', icon: <ScanIcon /> },
        { to: '/musavir/evraklar', label: 'Evraklar', icon: <FolderIcon /> },
        { to: '/musavir/disa-aktar', label: "Luca'ya Dışa Aktar", icon: <ExportIcon /> },
      ],
    },
    {
      label: 'Mükellef Yönetimi',
      items: [
        { to: '/musavir/sirket', label: 'Şirket Evrakları', icon: <BuildingIcon /> },
        { to: '/musavir/mukellef-kota', label: 'Mükellef Kota/Kredi', icon: <GaugeIcon /> },
      ],
    },
    {
      label: 'Araçlar',
      items: [
        { to: '/musavir/kdv', label: 'KDV Hesaplama', icon: <PercentIcon /> },
        { to: '/musavir/cift-evrak', label: 'Çift Evrak Kontrolü', icon: <LayersIcon /> },
        { to: '/musavir/loglar', label: 'Evrak Geçmişi', icon: <ClockIcon /> },
        { to: '/musavir/cop-kutusu', label: 'Çöp Kutusu', icon: <TrashIcon /> },
      ],
    },
    {
      label: 'Mali Müşavir',
      items: [
        { to: '/musavir', label: 'Mükellef Panosu', end: true, icon: <HomeIcon /> },
        { to: '/musavir/mukellefler', label: 'Mükelleflerim', icon: <UsersIcon /> },
        { to: '/abonelik', label: 'Hesap & Kullanım', icon: <WalletIcon /> },
      ],
    },
  ],
  admin: [
    {
      label: 'Genel',
      items: [
        { to: '/admin', label: 'Anasayfa', end: true, icon: <HomeIcon /> },
      ],
    },
    {
      label: 'Yönetim',
      items: [
        { to: '/admin/kullanicilar', label: 'Kullanıcılar', icon: <UsersIcon /> },
        { to: '/admin/planlar', label: 'Abonelik Planları', icon: <WalletIcon /> },
        { to: '/admin/odemeler', label: 'Ödeme Mutabakatı', icon: <WalletIcon /> },
        { to: '/admin/duyurular', label: 'Sistem Duyuruları', icon: <MegaphoneIcon /> },
      ],
    },
    {
      label: 'Tahsis',
      items: [
        { to: '/admin/kota', label: 'Kota Tahsis', icon: <GaugeIcon /> },
        { to: '/admin/ai-kredi', label: 'AI Kredi Tahsis', icon: <SparkleIcon /> },
      ],
    },
    {
      label: 'Sistem',
      items: [
        { to: '/admin/denetim', label: 'Denetim Günlüğü', icon: <ClockIcon /> },
        { to: '/admin/maliyetler', label: 'Altyapı Maliyetleri', icon: <PercentIcon /> },
        { to: '/admin/ayarlar', label: 'Sistem Ayarları', icon: <SettingsIcon /> },
      ],
    },
  ],
};

export const ROLE_LABEL: Record<Role, string> = {
  taxpayer: 'Mükellef',
  accountant: 'Mali Müşavir',
  admin: 'Admin',
};

export const ROLE_PANEL_LABEL: Record<Role, string> = {
  taxpayer: 'Mükellef Paneli',
  accountant: 'Mali Müşavir Paneli',
  admin: 'Admin Paneli',
};

export function flattenNav(sections: NavSection[]): NavLeaf[] {
  return sections.flatMap((s) => s.items);
}

// `end` olan link (panel kökü, ör. /musavir) yalnızca birebir eşleşmede aktiftir; yoksa
// altındaki her sayfa onu da aktif gösterirdi.
export function isLeafActive(leaf: NavLeaf, pathname: string): boolean {
  return leaf.end ? pathname === leaf.to : pathname === leaf.to || pathname.startsWith(`${leaf.to}/`);
}

/** Bu rol + bağlam hangi menüyü görür? Mükellefi olmayan müşavir sekmesi = ofis sekmesi. */
export function navFor(role: Role, hasTaxpayer: boolean): NavSection[] {
  return role === 'accountant' && !hasTaxpayer ? ACCOUNTANT_OFFICE_NAV : NAV[role];
}

/**
 * Bir adresin sayfa adı ve ikonu — üst bar başlığı, pencere başlığı ve SEKME şeridi
 * aynı yerden beslensin diye.
 *
 * Hesabım ve Ayarlar sol menüde değil (role bağımsız sayfalar), başlıkları elle veriliyor.
 * /abonelik menüde ("Hesap & Kullanım") olduğu için adını oradan alır.
 */
export function pageIdentityFor(role: Role, hasTaxpayer: boolean, path: string): { title: string; icon: ReactNode } {
  const pathname = path.split('?')[0];
  if (pathname.startsWith('/hesap')) return { title: 'Hesabım', icon: <UserIcon /> };
  if (pathname.startsWith('/ayarlar')) return { title: 'Ayarlar', icon: <SettingsIcon /> };
  // Aktif linki (en uzun eşleşen yol) başlık olarak kullan.
  const leaf = [...flattenNav(navFor(role, hasTaxpayer))]
    .sort((a, b) => b.to.length - a.to.length)
    .find((l) => isLeafActive(l, pathname));
  return { title: leaf?.label ?? ROLE_LABEL[role], icon: leaf?.icon ?? <HomeIcon /> };
}
