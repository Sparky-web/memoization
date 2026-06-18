# Мемокарты (memoization)

Веб-приложение для подготовки к экзаменам с помощью карточек и интервального повторения.

**Флоу пользователя:**

1. **Регистрация** (`/auth/signup`).
2. **Импорт колоды** — копируете готовый промпт для Клода, превращаете свой файл с вопросами в JSON
   формата `{ title, description?, cards: [{ question, answer }] }` и вставляете его — обе стороны карточек
   сохраняются в базе.
3. **Сессия повторения** — показывается вопрос, вы вспоминаете ответ про себя, переворачиваете карточку
   и свайпаете как в Тиндере: **вправо** — вспомнил, **влево** — было сложно.
4. **Интервальное повторение** (SM-2 + Leitner): трудные карточки возвращаются чаще, выученные — реже.
5. **Статистика** — прогресс по каждой колоде и сводка по всем (точность, серия дней, активность).
   Готовиться можно сразу к нескольким экзаменам — у каждого своя колода.

## Стек

| Область | Решение |
|---|---|
| Фреймворк | TanStack Start (Vite, file-based роуты), React 19, TS strict |
| Данные | Server Functions (`src/server/fn/*`) + react-query; тиры доступа через middleware |
| БД | Prisma + PostgreSQL (`Deck` → `Card` → `Review`), прогресс приватный для пользователя |
| Auth | better-auth, email+пароль (bcrypt), открытая регистрация |
| Повторение | `src/lib/src/spacedRepetition.ts` — чистая функция SM-2/Leitner |
| Ошибки | Sentry (опционально, по `VITE_SENTRY_DSN`) |
| Стиль кода | строгий ESLint: запрет `as`, кириллица через `typo()`, слои и сегменты страниц |

## Локальный запуск

```bash
pnpm install
cp .env.example .env            # заполнить DATABASE_URL и BETTER_AUTH_SECRET (openssl rand -hex 32)
createdb memoization
pnpm prisma migrate deploy      # накатить миграции
pnpm dev                        # http://localhost:3100
```

## Структура

- `src/routes/` — страницы: `/` (лендинг), `/auth/*`, `/app` (приватный раздел с guard'ом):
  дашборд колод, `decks/new` (импорт), `decks/$deckId` (карточки + статистика),
  `decks/$deckId/study` (сессия свайпов), `stats`.
- `src/server/fn/{decks,cards,study,stats}.ts` — server functions (все скоупятся по `userId`).
- `src/lib/` — изоморфные утилиты: планировщик повторений, парсер импорта, `typo()`.
- `src/components/` — UI-библиотека.

## Проверки и деплой

`pnpm check` = eslint + `tsc --noEmit` + `check:exports`; плюс `pnpm knip`. Прод-сборка: `pnpm build` → `pnpm start`.

Деплой на VDS (Docker, сборка на сервере, GitHub Actions) — см. [`DEPLOY.md`](./DEPLOY.md).
Правила архитектуры и кода — в [`CLAUDE.md`](./CLAUDE.md).
