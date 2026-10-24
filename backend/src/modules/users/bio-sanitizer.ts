import sanitizeHtml from 'sanitize-html';

/**
 * Biyografi herkese açık profil sayfasında girişsiz render edilir — bu yüzden
 * kayıttan önce sıkı bir allowlist ile temizlenir (stored XSS'e karşı).
 * Yalnızca temel zengin metin biçimlendirme + link'e izin verilir; style/script/on*
 * öznitelikleri ve izin verilmeyen etiketler tamamen düşürülür.
 */
const BIO_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'p', 'br', 'ul', 'ol', 'li', 'a', 'h3', 'h4', 'blockquote'],
  allowedAttributes: { a: ['href', 'title'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }, true),
  },
};

export function sanitizeBio(html: string): string {
  return sanitizeHtml(html, BIO_SANITIZE_OPTIONS).trim();
}
