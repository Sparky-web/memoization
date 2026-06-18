# Деплой на VDS

Прод: один Docker-контейнер с SSR-приложением. Образ **собирается прямо на сервере** из исходников
(их доставляет `rsync` в GitHub Actions) — без реестра. Postgres — на хосте (не в docker), контейнер
ходит в него через `host.docker.internal`. HTTPS/домен — на хостовом nginx + certbot.

```
git push main
   └─ Actions: pnpm build (пре-флайт) + lint/typecheck/knip → rsync на VDS → ssh: docker compose build && up -d
nginx (хост, TLS) → 127.0.0.1:${APP_PORT} → app (Docker) → host.docker.internal:5432 (Postgres хоста)
```

## Параметры этого проекта

- Домен: `memoization.studentto.ru`
- Порт приложения: `APP_PORT=3001` (на `127.0.0.1`, на него смотрит nginx)
- Каталог деплоя: `/home/vladislav/memoization`
- БД/роль Postgres: `memoization`

## Секреты GitHub (Settings → Secrets and variables → Actions)

| Секрет | Значение |
|---|---|
| `DEPLOY_HOST` | IP/домен сервера |
| `DEPLOY_USER` | ssh-пользователь (в группе docker) |
| `DEPLOY_SSH_KEY` | приватный ssh-ключ (публичный — в `~/.ssh/authorized_keys` сервера) |
| `DEPLOY_PATH` | `/home/vladislav/memoization` |

## `.env` на сервере (в каталоге деплоя; rsync его НЕ трогает — `--exclude='.env'`)

```env
APP_PORT=3001
DATABASE_URL=postgresql://memoization:ПАРОЛЬ@host.docker.internal:5432/memoization
BETTER_AUTH_URL=https://memoization.studentto.ru
BETTER_AUTH_SECRET=...        # openssl rand -hex 32
VITE_SENTRY_DSN=              # опционально

# Прокси для Claude (из РФ api.anthropic.com отдаёт 403 — нужен HTTP(S)-прокси вне РФ):
HTTPS_PROXY=http://ЛОГИН:ПАРОЛЬ@ХОСТ:ПОРТ
HTTP_PROXY=http://ЛОГИН:ПАРОЛЬ@ХОСТ:ПОРТ
NO_PROXY=localhost,127.0.0.1,host.docker.internal
```

## Подготовка сервера (один раз)

```bash
# БД и роль
sudo -u postgres psql -c "CREATE ROLE memoization LOGIN PASSWORD '<пароль>';"
sudo -u postgres createdb -O memoization memoization

# каталог + .env (см. выше)
mkdir -p ~/memoization && nano ~/memoization/.env

# nginx (HTTP) → потом certbot добавит TLS и редирект
sudo tee /etc/nginx/sites-enabled/memoization >/dev/null <<'NGINX'
server {
    listen 80;
    server_name memoization.studentto.ru;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d memoization.studentto.ru --non-interactive --redirect
```

## Миграции

Заведены с первого дня (`prisma/migrations`). `docker/entrypoint.sh` при старте катит `prisma migrate deploy`
на чистую базу. Изменения схемы дальше — `pnpm prisma migrate dev --name <что>` → коммит → push.
`db push` на проде не используем.

## Смена `.env` / перезапуск

`.env` живёт на сервере; после правки серверных переменных — пересоздать контейнер:

```bash
cd ~/memoization && docker compose up -d --force-recreate
```

Клиентские `VITE_*` впекаются в бандл на сборке → их смена требует пересборки (`docker compose build`).

## Генерация колод (Claude CLI)

Режим «Сгенерировать» запускает `claude -p` (модель `opus`) внутри контейнера: claude читает материалы
пользователя из `data/jobs/<deckId>/inputs/` и пишет `output.json` с карточками (вопрос + краткий и
развёрнутый ответы). Процесс асинхронный: колода создаётся со статусом `processing`, по готовности —
`ready`, при ошибке — `failed`. Очередь последовательная (один claude за раз).

- **claude CLI** ставится в образ (`Dockerfile`: `npm i -g @anthropic-ai/claude-code`).
- **Авторизация** хранится в томе `./claude-home:/root/.claude` и переживает пересоздание/деплой.
  Каталог `claude-home` (и `data`) исключён из rsync деплоя (как `.env`) — иначе `--delete` падает
  на root-овых файлах, созданных claude в контейнере.
  Войти нужно один раз:
  ```bash
  cd ~/memoization
  docker compose exec -it app claude   # выбрать вход в аккаунт, открыть ссылку в браузере, затем /exit
  ```
- **Прокси (для РФ обязателен):** `api.anthropic.com` напрямую отдаёт 403 — нужен HTTP(S)-прокси вне РФ.
  Пропишите `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` в `.env` (см. выше) и пересоздайте контейнер
  (`docker compose up -d --force-recreate`). Приложение спавнит claude с `env: process.env` — прокси
  подхватывается автоматически и для входа, и для генерации.
- **Файлы**: до 5 шт по 10 МБ в каждом поле. `.doc/.docx` конвертируются в текст на сервере
  (`word-extractor`) до передачи claude; `.pdf`, изображения и текстовые форматы claude читает сам.
- **Проверка связи/входа:** `docker compose exec -T app claude -p "ответь: ок"` — должен ответить.
- При рестарте контейнера «зависшие» задания `processing` помечаются `failed` (сброс на старте `src/server.ts`).
