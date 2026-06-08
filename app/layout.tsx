import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-inter-tight",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const ICON_BASE = "/assets/images/favicon";

export const metadata: Metadata = {
  title: "Mess Management",
  description: "RFID coupon & wallet management system",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: `${ICON_BASE}/favicon.ico`, sizes: "any" },
      { url: `${ICON_BASE}/favicon.svg`, type: "image/svg+xml" },
      { url: `${ICON_BASE}/favicon-96x96.png`, type: "image/png", sizes: "96x96" },
    ],
    apple: [{ url: `${ICON_BASE}/apple-touch-icon.png`, sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Mess Management",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdfbf6" },
    { media: "(prefers-color-scheme: dark)", color: "#16140f" },
  ],
};

// Set the theme before first paint to avoid a flash of the wrong theme.
const themeInit = `
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="font-body bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
