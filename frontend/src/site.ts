/**
 * Sitenin dışarıdan görünen adresi. Derleme sırasında VITE_SITE_URL ile verilir;
 * verilmezse tarayıcının açtığı adres kullanılır.
 */
const envUrl = (import.meta.env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '');

export const SITE_URL: string = envUrl || window.location.origin;
export const SITE_HOST: string = new URL(SITE_URL).host;
export const SUPPORT_EMAIL: string =
  (import.meta.env.VITE_SUPPORT_EMAIL ?? '').trim() || `destek@${SITE_HOST.replace(/:\d+$/, '')}`;
