#!/bin/sh
set -e

# Применяем схему БД. Есть папка prisma/migrations — катим миграции (prod-путь);
# нет миграций (проект жил на db push) — синхронизируем схему напрямую.
if [ -d prisma/migrations ]; then
  echo "→ prisma migrate deploy"
  pnpm prisma migrate deploy
else
  echo "→ prisma db push (миграций нет)"
  pnpm prisma db push
fi

echo "→ старт сервера"
exec pnpm start
