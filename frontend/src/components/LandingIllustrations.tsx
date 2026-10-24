import { SVGProps } from 'react';

/**
 * Landing page için el yapımı, marka rengiyle uyumlu düz (flat) kurumsal illüstrasyonlar.
 * Harici görsel/illüstrasyon kütüphanesi kullanılmaz — tamamen satır içi SVG. Ten/saç/kıyafet
 * tonları bilinçli olarak sabit tutulur (unDraw tarzı illüstrasyon kuralı): açık/koyu temada
 * yalnızca arka plan blob'u ve gölge değişir, figürler her iki temada da aynı okunurlukta kalır.
 */

const SKIN = '#eab98c';
const HAIR = '#3b2a20';
const SHIRT = '#ffffff';
const BLAZER = '#1d4ed8';
const BLAZER_2 = '#0f2f8f';
const DESK = '#c9925f';
const PLANT = '#16a34a';

/** Hero illüstrasyonu — masasında dizüstü bilgisayar ve evraklarla çalışan bir mali müşavir/muhasebeci. */
export function OfficeDeskIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 480 400" fill="none" {...props}>
      <circle cx="240" cy="200" r="190" fill="var(--primary-soft)" />

      {/* masa */}
      <rect x="60" y="270" width="360" height="18" rx="6" fill={DESK} />
      <rect x="80" y="288" width="16" height="70" fill={DESK} opacity=".8" />
      <rect x="384" y="288" width="16" height="70" fill={DESK} opacity=".8" />

      {/* sandalye + kişi (masaya oturmuş, üst gövde) */}
      <rect x="176" y="150" width="92" height="110" rx="26" fill={BLAZER} />
      <rect x="176" y="150" width="46" height="110" rx="26" fill={BLAZER_2} opacity=".55" />
      <circle cx="222" cy="120" r="38" fill={SKIN} />
      <path d="M186 106c4-30 68-30 72 0-10-8-62-8-72 0Z" fill={HAIR} />
      <path d="M186 108c-2 14 2 26 10 34" stroke={HAIR} strokeWidth="6" strokeLinecap="round" fill="none" />
      <rect x="204" y="150" width="36" height="34" rx="10" fill={SHIRT} />

      {/* kollar / masadaki eller */}
      <path d="M198 190c-18 10-28 26-30 46" stroke={BLAZER} strokeWidth="18" strokeLinecap="round" fill="none" />
      <path d="M246 190c18 10 28 26 30 46" stroke={BLAZER} strokeWidth="18" strokeLinecap="round" fill="none" />
      <circle cx="168" cy="240" r="11" fill={SKIN} />
      <circle cx="276" cy="240" r="11" fill={SKIN} />

      {/* dizüstü bilgisayar */}
      <rect x="188" y="222" width="76" height="50" rx="4" fill="#0f172a" />
      <rect x="192" y="226" width="68" height="38" rx="2" fill="#2563eb" opacity=".9" />
      <rect x="180" y="270" width="92" height="8" rx="3" fill="#334155" />

      {/* evrak yığını */}
      <g transform="translate(300 230)">
        <rect x="0" y="14" width="58" height="42" rx="4" fill="var(--surface)" stroke="var(--border)" />
        <rect x="6" y="6" width="58" height="42" rx="4" fill="#ffffff" stroke="var(--border)" />
        <rect x="14" y="16" width="42" height="4" rx="2" fill="var(--primary)" opacity=".7" />
        <rect x="14" y="24" width="34" height="4" rx="2" fill="#cbd5e1" />
        <rect x="14" y="32" width="38" height="4" rx="2" fill="#cbd5e1" />
      </g>

      {/* kahve fincanı */}
      <g transform="translate(112 236)">
        <rect x="0" y="6" width="22" height="20" rx="3" fill="#ffffff" stroke="var(--border)" />
        <path d="M22 10h6a6 6 0 0 1 0 12h-6" stroke="var(--border)" fill="none" />
        <rect x="4" y="2" width="14" height="6" rx="2" fill="#8b5e34" />
      </g>

      {/* saksı bitki */}
      <g transform="translate(330 176)">
        <path d="M10 46c-16-6-16-30 2-34 6-14 30-14 34 2 16 2 18 24 4 32-10 8-30 8-40 0Z" fill={PLANT} />
        <rect x="8" y="44" width="26" height="18" rx="4" fill="#7c5636" />
      </g>

      {/* uçuşan küçük ikonlar: KDV yüzdesi + onay */}
      <g transform="translate(94 96)">
        <circle r="16" fill="var(--surface)" stroke="var(--border)" />
        <text x="0" y="5" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--primary)">%</text>
      </g>
      <g transform="translate(388 132)">
        <circle r="16" fill="var(--surface)" stroke="var(--border)" />
        <path d="m-6 0 4 4 8-8" stroke="var(--success)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** CTA illüstrasyonu — mükellef ve mali müşavirin evrak üzerinde el sıkışıp anlaşması. */
export function HandshakeIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 320 260" fill="none" {...props}>
      <circle cx="160" cy="130" r="120" fill="var(--primary-soft)" />

      {/* sol kişi */}
      <circle cx="96" cy="92" r="26" fill={SKIN} />
      <path d="M72 82c2-20 46-20 48 0-8-6-40-6-48 0Z" fill={HAIR} />
      <rect x="56" y="112" width="80" height="86" rx="30" fill={BLAZER} />
      <path d="M96 130c-20 8-32 24-34 46" stroke={BLAZER} strokeWidth="16" strokeLinecap="round" fill="none" />

      {/* sağ kişi */}
      <circle cx="224" cy="92" r="26" fill="#f4d9bd" />
      <path d="M200 78c4-18 44-18 48 2-10-8-38-8-48-2Z" fill="#5b3a24" />
      <rect x="184" y="112" width="80" height="86" rx="30" fill="#0f766e" />
      <path d="M224 130c20 8 32 24 34 46" stroke="#0f766e" strokeWidth="16" strokeLinecap="round" fill="none" />

      {/* el sıkışma */}
      <ellipse cx="160" cy="176" rx="22" ry="12" fill={SKIN} />

      {/* ortadaki evrak/onay kartı */}
      <g transform="translate(132 34)">
        <rect x="0" y="0" width="56" height="70" rx="6" fill="var(--surface)" stroke="var(--border)" />
        <rect x="10" y="12" width="36" height="5" rx="2.5" fill="var(--primary)" opacity=".7" />
        <rect x="10" y="24" width="28" height="5" rx="2.5" fill="#cbd5e1" />
        <rect x="10" y="34" width="30" height="5" rx="2.5" fill="#cbd5e1" />
        <circle cx="28" cy="54" r="12" fill="var(--success-soft)" />
        <path d="m22 54 4 4 8-8" stroke="var(--success)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
