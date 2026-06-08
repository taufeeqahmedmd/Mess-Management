import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Replaces the generator's static site.webmanifest
// so icon paths, name, and brand colors stay in sync with the app.
const ICON_BASE = "/assets/images/favicon";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mess Management",
    short_name: "Mess",
    description: "RFID coupon & wallet management system",
    start_url: "/",
    display: "standalone",
    background_color: "#fdfbf6",
    theme_color: "#e0a93a",
    icons: [
      // "any" entries drive desktop install (taskbar / title bar) — uncropped.
      {
        src: `${ICON_BASE}/web-app-manifest-192x192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${ICON_BASE}/web-app-manifest-512x512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // "maskable" entries drive Android adaptive icons (safe-zone padded).
      {
        src: `${ICON_BASE}/web-app-manifest-192x192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${ICON_BASE}/web-app-manifest-512x512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
