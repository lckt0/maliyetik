/**
 * Sunucu tarafı MIME allowlist'i — istemcinin bildirdiği `mimetype` doğrudan
 * güvenilmez, ama en azından SVG/HTML gibi tarayıcıda yorumlanabilir tipleri
 * (stored XSS vektörü) evrak/avatar yüklemelerinden tamamen dışlar.
 */
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  ...ALLOWED_IMAGE_MIME_TYPES,
  'application/pdf',
]);
