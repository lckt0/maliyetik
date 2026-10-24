/** Yasal metinlerin ortak biçimi. Metinler JSX değil veri olarak tutuluyor: aynı
 *  kabuk hepsini render eder, arama/indeksleme ve sürümleme kolaylaşır. */
export type YasalBolum = {
  baslik: string;
  paragraflar?: string[];
  maddeler?: string[];
  tablo?: { basliklar: string[]; satirlar: string[][] };
};

export type YasalMetin = {
  slug: string;
  baslik: string;
  /** Liste sayfasında ve <meta description> yerine kullanılan tek cümlelik özet. */
  ozet: string;
  bolumler: YasalBolum[];
};
