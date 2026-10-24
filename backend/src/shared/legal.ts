/**
 * Yasal metin sürümü ve onay kayıtlarında kullanılan slug'lar.
 *
 * SÜRÜM, frontend/src/legal/firma.ts içindeki YASAL_SURUM ile AYNI olmalıdır —
 * metin değişip sürüm yükseldiğinde iki taraf da güncellenir. Onay kaydı sürümle
 * saklandığı için, eski sürümü onaylamış kullanıcılar için yeniden onay istenip
 * istenmeyeceği ileride bu alana bakılarak kararlaştırılabilir.
 */
export const YASAL_METIN_SURUMU = '1.0';

/** Kayıt sırasında zorunlu olarak onaylanan metinler (tek kutu, üç metin). */
export const ZORUNLU_ONAY_METINLERI = ['kullanim-kosullari', 'gizlilik', 'aydinlatma'] as const;

/** Açık rızaya bağlı, ayrı ayrı geri alınabilen onaylar. */
export const ACIK_RIZA_PAZARLAMA = 'acik-riza-pazarlama';
export const ACIK_RIZA_YAPAY_ZEKA = 'acik-riza-yapay-zeka';
