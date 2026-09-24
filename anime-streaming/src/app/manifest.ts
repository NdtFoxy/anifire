import type { MetadataRoute } from "next";

/** Installable app: home screen on phones, desktop PWA, and TV browsers. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Anifire — аниме онлайн",
    short_name: "Anifire",
    description: "Смотрите аниме с озвучкой и субтитрами. Новые серии из закладок — сразу в уведомлениях.",
    lang: "ru",
    start_url: "/stream",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0A0707",
    theme_color: "#0A0707",
    categories: ["entertainment", "video"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Каталог", url: "/stream?view=catalog", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Моё", url: "/mylist", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
