import type { YasalMetin } from '../tipler';
import { aydinlatma } from './aydinlatma';
import { acikRiza } from './acik-riza';
import { gizlilik } from './gizlilik';
import { cerez } from './cerez';
import { kullanimKosullari } from './kullanim-kosullari';
import { mesafeliSatis } from './mesafeli-satis';
import { iptalIade } from './iptal-iade';

/** Sırası, /yasal liste sayfasındaki sırayı belirler. */
export const YASAL_METINLER: YasalMetin[] = [
  kullanimKosullari,
  gizlilik,
  aydinlatma,
  acikRiza,
  cerez,
  mesafeliSatis,
  iptalIade,
];

export function yasalMetinBul(slug: string | undefined): YasalMetin | undefined {
  return YASAL_METINLER.find((m) => m.slug === slug);
}
