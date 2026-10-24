import { SVGProps } from 'react';

/**
 * Mobil uygulamaya özgü ek ikonlar — ortak `components/Icons.tsx` setinde karşılığı
 * olmayanlar (tarayıcı kontrolleri, iOS kurulum yönergesi). Aynı stil sözleşmesini
 * kullanır: tek renkli, satır içi SVG, `currentColor`.
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export function ArrowLeftIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function FlashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
    </svg>
  );
}

export function FlashOffIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
      <path d="M2 2l20 20" />
    </svg>
  );
}

export function RetakeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function CropIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}

export function FileTextIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 2v20l2.5-1.5L10 22l2-1.5L14 22l2.5-1.5L19 22V2H5Z" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </svg>
  );
}

/** iOS "Paylaş" düğmesi — ana ekrana ekleme yönergesinde gösterilir. */
export function ShareIosIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v13" />
      <path d="m8 7 4-4 4 4" />
      <path d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5" />
    </svg>
  );
}

export function PlusSquareIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
