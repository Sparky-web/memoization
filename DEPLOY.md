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

# ИИ-провайдер через CLI. Модели Codex можно не задавать — приложение использует gpt-5.6-terra.
AI_PROVIDER=codex
CODEX_GENERATION_MODEL=
CODEX_CHAT_MODEL=
CODEX_FAST_MODEL=

# Прокси, если доступ к провайдеру с сервера ограничен:
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

## Генерация материалов (Codex CLI)

Приложение по умолчанию запускает `codex exec` внутри контейнера. Большая генерация получает доступ
на запись только к каталогу задания `data/jobs/<examId>/`, разговорные функции работают в режиме
`read-only`. Процесс асинхронный: экзамен создаётся со статусом `processing`, по готовности — `ready`,
при ошибке — `failed`. Очередь большой генерации последовательная.

- **Codex CLI** и резервный Claude CLI ставятся в образ. Провайдер выбирается через
  `AI_PROVIDER=codex|claude`; смена переменной требует пересоздания контейнера.
- **Авторизация Codex** хранится в `./codex-home:/root/.codex` и переживает деплои. Каталоги
  `codex-home`, `claude-home` и `data` исключены из rsync. После первой сборки войдите один раз:
  ```bash
  cd ~/memoization
  docker compose exec -it app codex login --device-auth
  ```
- **Проверка входа:**
  ```bash
  printf 'Ответь одним словом: ок' | docker compose exec -T app codex exec \
    --skip-git-repo-check --sandbox read-only --ephemeral --ignore-user-config -
  ```
- `CODEX_GENERATION_MODEL`, `CODEX_CHAT_MODEL` и `CODEX_FAST_MODEL` опциональны. Пустое значение
  использует `gpt-5.6-terra`, заданную приложением по умолчанию.
- Для временного возврата на Claude задайте `AI_PROVIDER=claude`; его прежний том авторизации
  сохранён. Прокси из `.env` передаётся обоим CLI.
- `.doc/.docx` конвертируются в текст через `word-extractor`, PDF — через `pdftotext`; ИИ получает
  уже извлечённый текст в изолированной папке задания. PDF-сканам без текстового слоя потребуется OCR.
- При рестарте контейнера зависшие задания `processing` помечаются `failed` в `src/server.ts`.
