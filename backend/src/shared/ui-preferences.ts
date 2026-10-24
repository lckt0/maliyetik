/**
 * Kullanıcının cihazlar arası senkron arayüz tercihleri.
 *
 * Panel "Ayarlar" sayfası bu alanları düzenler; hepsi tek bir JSON kolonunda
 * (`users.ui_preferences`) tutulur — her yeni tercih için migration gerekmesin diye.
 * Bilinmeyen/eski anahtarlar korunur, doğrulama `UpdatePreferencesDto`'da yapılır.
 */
export interface UiPreferences {
  /** 'system': işletim sisteminin koyu/açık tercihini izler. */
  theme?: 'light' | 'dark' | 'system';
  sidebarLeftDocked?: boolean;
  sidebarRightDocked?: boolean;
  /** Arayüz ölçeği (kök yazı boyutu çarpanı) — 0.85 ile 1.4 arası. */
  uiScale?: number;
  /** Tablo/liste satır yoğunluğu. */
  density?: 'comfortable' | 'compact';
  /** Liste sayfalarında sayfa başına satır. */
  pageSize?: 10 | 20 | 50 | 100;
  /** Animasyonları azalt (hareket duyarlılığı / düşük güçlü cihaz). */
  reduceMotion?: boolean;
  /** Giriş sonrası açılacak sayfa — 'home' panel anasayfası. */
  landingPage?: 'home' | 'documents' | 'upload';
  /** Anasayfadaki sağ kenar çubuğunu tamamen gizle. */
  hideRightSidebar?: boolean;
  /** Bildirim tercihleri — e-posta ile gönderilecek bildirim türleri. */
  emailReminders?: boolean;
  emailDocumentActivity?: boolean;

  /**
   * "Yapay zeka deneyimi" (doğal dille arama, bulgu özeti, akıllı yardımcı) açık mı.
   * Kaydedilmemişse AÇIK kabul edilir. Evrak dijitalleştirmedeki AI ayrı bir özelliktir
   * ve bu anahtardan etkilenmez — o kredi tüketir, bu tüketmez.
   */
  aiExperience?: boolean;
}
