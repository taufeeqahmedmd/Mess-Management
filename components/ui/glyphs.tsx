import type { SVGProps } from "react";

/**
 * Small stroke glyphs for toolbar/inline buttons (Bhojan Tricolour). Default to
 * 15px; pass `className` to resize. Stroke uses currentColor so they inherit the
 * button's text color.
 */
function G({ children, className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "size-[15px]"}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Download into a tray (Export CSV). */
export const DownloadGlyph = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </G>
);

/** Upload from a tray (Import CSV). */
export const UploadGlyph = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M12 15V3m0 0L8 7m4-4 4 4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </G>
);

/** Clock with a reset arrow (expiry sweep). */
export const ClockGlyph = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </G>
);

/** Plus (Add). */
export const PlusGlyph = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M12 5v14M5 12h14" />
  </G>
);

/** Magnifier (Search). */
export const SearchGlyph = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </G>
);

/** Arrow right (card-UID change). */
export const ArrowRightGlyph = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M5 12h14m0 0-6-6m6 6-6 6" />
  </G>
);

/** Printer (print invoice). */
export const PrinterGlyph = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M6 9V3h12v6" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="7" rx="1" />
  </G>
);

/** X (remove row / close). */
export const XGlyph = (p: SVGProps<SVGSVGElement>) => (
  <G {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </G>
);
