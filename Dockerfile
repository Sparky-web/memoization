# syntax=docker/dockerfile:1

# Стек: TanStack Start + pnpm + Prisma (без браузера). На debian-slim Prisma требует openssl.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# --- Сборка: ставим все зависимости (включая dev) и билдим ---
# ВАЖНО: НЕ ставить здесь NODE_ENV=development — иначе Vite соберёт dev JSX-рантайм (jsxDEV),
# и SSR в проде падает «jsxDEV is not a function». NODE_ENV не задан → install тянет dev-зависимости,
# а vite build идёт в production-режиме.
FROM base AS build
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
# postinstall = prisma generate (нужна schema, БД не требуется)
RUN pnpm install --frozen-lockfile
COPY . .
# Клиентский VITE_* инлайнится в бандл на сборке; серверный env читается лениво в рантайме
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN SKIP_ENV_VALIDATION=1 pnpm build

# --- Рантайм: dist + node_modules (+ prisma CLI для миграций) ---
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV HOME=/root
# claude CLI для режима «Сгенерировать» (claude -p). Авторизация — через том /root/.claude (вход один раз).
RUN npm install -g @anthropic-ai/claude-code
# ffmpeg — перепаковка голосовых записей MediaRecorder (webm/mp4 → ogg/opus): SpeechKit v1 принимает только oggopus
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY docker/entrypoint.sh ./entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
