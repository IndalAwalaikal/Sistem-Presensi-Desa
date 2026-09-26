import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { IBM_Plex_Mono, Public_Sans, Source_Serif_4 } from "next/font/google";
import { SessionProvider } from "@/providers/session";
import { KREDIT, KREDIT_LENGKAP } from "@/components/ui/kolofon";
import "./globals.css";

const serifDisplay = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

/**
 * Mono instrumen. Sebelumnya hanya dirujuk lewat var(--font-plex-mono) di
 * ring-geofence tanpa pernah dimuat, sehingga angka jatuh ke sans-serif.
 * Sekarang setiap waktu, jarak, skor, dan label arsip benar-benar mono.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Presensi — Pemerintah Desa Anabanua",
    template: "%s — Pemerintah Desa Anabanua",
  },
  description:
    "Sistem presensi dan monitoring kedisiplinan perangkat Desa Anabanua: verifikasi wajah, liveness, GPS geofence, dan waktu server.",
  applicationName: "Presensi Anabanua",
  authors: [{ name: KREDIT.tim }],
  creator: KREDIT_LENGKAP,
  publisher: "Pemerintah Desa Anabanua",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo-barru.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0f3320",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // CSP memakai nonce berbeda tiap request; halaman harus dirender dinamis
  // agar Next dapat memasang nonce pada skrip kerangka aplikasinya.
  await connection();

  return (
    <html
      lang="id"
      className={`${serifDisplay.variable} ${publicSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh bg-meja font-sans text-tinta antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
