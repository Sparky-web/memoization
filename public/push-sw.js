// Service worker push-напоминаний. Регистрируется ТОЛЬКО по действию пользователя
// в настройках (scope /push/ — не конфликтует с /sw.js, который держит PWA).
// Намеренно без fetch-кэширования: приложение SSR с авторизацией.

self.addEventListener("push", (event) => {
  const fallback = { title: "Домашник", body: "Пора повторить карточки", url: "/app" };
  let data = fallback;
  try {
    data = { ...fallback, ...event.data.json() };
  } catch {
    // Непарсируемый payload — показываем запасной текст.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const target = new URL(url, self.location.origin).href;
      const existing = clients.find((client) => client.url === target) || clients[0];
      if (existing) {
        return existing.focus().then((focused) => {
          // Уже открытая вкладка приложения переводится на нужный экран.
          if (focused && "navigate" in focused && focused.url !== target) return focused.navigate(target);
          return focused;
        });
      }
      return self.clients.openWindow(target);
    }),
  );
});
