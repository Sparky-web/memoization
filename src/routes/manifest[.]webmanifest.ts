import { createFileRoute } from "@tanstack/react-router";

import { typo } from "~/lib";

// Манифест раздаём из серверного роута, а не статикой: статик-сервер отдаёт
// .webmanifest как application/octet-stream, и браузеры игнорируют манифест
// (PWA не ставится в standalone). Здесь Content-Type задаём явно.
interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

interface WebManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  orientation: string;
  background_color: string;
  theme_color: string;
  lang: string;
  icons: ManifestIcon[];
}

const manifest: WebManifest = {
  // Стабильная идентичность установки.
  id: "/",
  name: typo("Мемокарты"),
  short_name: typo("Мемокарты"),
  description: typo("Карточки для подготовки к экзаменам с интервальным повторением"),
  // Лендинг доступен всем без редиректа; /app требует авторизации (отдавал 307 → /auth/signin),
  // из-за чего iOS терял standalone-контекст при запуске с домашнего экрана.
  start_url: "/",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#f4f4f6",
  theme_color: "#5b57e0",
  lang: "ru",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(manifest), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
