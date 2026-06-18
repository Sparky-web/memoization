// Минимальный service worker: нужен для установки PWA (требуется fetch-обработчик).
// Намеренно без кэширования — приложение SSR с авторизацией, кэш отдавал бы устаревшие данные.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // passthrough: запрос обрабатывает сеть/браузер
});
