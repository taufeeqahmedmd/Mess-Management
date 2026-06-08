import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

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

// Follow the OS colour scheme only (no manual toggle). Applied before first
// paint to avoid a flash, and kept in sync if the system preference changes.
const themeInit = `
(function () {
  try {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var apply = function () {
      if (mq.matches) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    };
    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq.addListener) mq.addListener(apply);
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
      <body className="font-body bg-canvas text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
