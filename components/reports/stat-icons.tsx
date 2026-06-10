/**
 * Clean line icons for the dashboard KPI cards (24×24, inherit currentColor).
 * Rendered ~20px inside StatCard's icon badge — modern, not decorative-tiny.
 */
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "size-5",
  "aria-hidden": true,
};

export const UsersIcon = () => (
  <svg {...base}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
  </svg>
);

export const ReceiptIcon = () => (
  <svg {...base}>
    <path d="M4 2h16v20l-3-2-2 2-3-2-3 2-2-2-3 2V2Z" />
    <path d="M8 7h8M8 11h8M8 15h5" />
  </svg>
);

export const BagIcon = () => (
  <svg {...base}>
    <path d="M6 2 4 6v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4H6Z" />
    <path d="M4 6h16" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export const TrendingUpIcon = () => (
  <svg {...base}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </svg>
);

export const WalletIcon = () => (
  <svg {...base}>
    <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
    <path d="M21 7H6a3 3 0 0 0 0 6h15v-6Z" />
    <circle cx="16.5" cy="10" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const CoinsIcon = () => (
  <svg {...base}>
    <circle cx="9" cy="9" r="6" />
    <path d="M16.5 4.2a6 6 0 0 1 0 11.6M18.1 7.5a6 6 0 0 1 0 9" />
  </svg>
);

export const ChefHatIcon = () => (
  <svg {...base}>
    <path d="M6 14a4 4 0 0 1-1-7.9A5 5 0 0 1 15 5a4 4 0 0 1 4 8" />
    <path d="M6 13v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6" />
    <path d="M9 17h6" />
  </svg>
);

export const BankIcon = () => (
  <svg {...base}>
    <path d="M3 9 12 4l9 5" />
    <path d="M4 9v9M9 9v9M15 9v9M20 9v9" />
    <path d="M3 20h18" />
  </svg>
);
