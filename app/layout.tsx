import type { Metadata, Viewport } from "next";
import Script from "next/script";
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

// Apply the user's saved Light/Dark choice (profile dropdown) before first
// paint to avoid a flash. Defaults to Light when no choice has been made; the
// toggle in components/shell/theme-control.tsx keeps this in sync.
const themeInit = `
(function () {
  try {
    var pref = null;
    try { pref = localStorage.getItem("theme"); } catch (e) {}
    if (pref === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
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
      <body className="font-body bg-canvas text-ink antialiased">
        {/* Applies the saved Light/Dark choice before hydration (no flash), via
            next/script so React doesn't warn about an inline <script> element. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
