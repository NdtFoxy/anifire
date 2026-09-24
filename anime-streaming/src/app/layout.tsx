import type { Metadata, Viewport } from "next";
import { Montserrat, Inter } from "next/font/google";
import "./globals.css";
// Loaded after globals so the adaptive tokens win over Tailwind preflight.
import "@/styles/adaptive.css";
// Motion vocabulary comes after the adaptive tokens: it reads --tap/--safe-* and
// owns the single prefers-reduced-motion switch for the app.
import "@/styles/motion.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PlayerProvider } from "@/components/player/PlayerProvider";
import PlayerRoot from "@/components/player/PlayerRoot";
import { DeviceProvider } from "@/components/system/DeviceProvider";
import SpatialNav from "@/components/system/SpatialNav";

const display = Montserrat({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Anifire — Аниме стриминг",
  description:
    "Смотри лучшие аниме сериалы онлайн. Новинки каждый день, огромная библиотека жанров и персональные рекомендации.",
};

/**
 * `viewport-fit=cover` lets the layout paint under the notch and home
 * indicator; the safe-area insets in adaptive.css keep content out of them.
 * Zoom stays enabled — capping it breaks accessibility on phones.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0707",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DeviceProvider>
          <AuthProvider>
            <PlayerProvider>
              <SpatialNav />
              {children}
              <PlayerRoot />
            </PlayerProvider>
          </AuthProvider>
        </DeviceProvider>
      </body>
    </html>
  );
}
