import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 3000 },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // Сегменты страниц лежат в `_lib`; underscore-префикс исключаем из роутинга
      // (routeFileIgnorePrefix не может быть "_" — зарезервирован под pathless-роуты)
      router: { routeFileIgnorePattern: "_lib" },
    }),
    viteReact(),
    // Загрузка sourcemaps в Sentry — только при наличии токена
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryTanstackStart({
            sentryUrl: process.env.SENTRY_URL,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            sourcemaps: { filesToDeleteAfterUpload: ["**/*.map"] },
          }),
        ]
      : []),
  ],
});
