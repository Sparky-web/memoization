-- Домашник, волна 7 (фиксы ревью).
-- 1) Журнал серии StreakDay: durable-зачёт «план дня закрыт» (день с < 10 ответами не забывается
--    назавтра) и durable-автосписание заморозок (kind="freeze", остаток — скользящие 30 дней).
-- 2) Счётчики заморозок из UserSettings больше не нужны (никогда реально не списывались).
-- 3) Бэкфил битых строк прогресса: reps > 0 без lastReviewedAt роняли расчёт вероятности
--    припоминания (FSRSValidationError в ts-fsrs) — восстанавливаем момент из due − stability.

CREATE TABLE "StreakDay" (
    "id" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "StreakDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StreakDay_userId_dayKey_key" ON "StreakDay"("userId", "dayKey");

ALTER TABLE "StreakDay" ADD CONSTRAINT "StreakDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSettings" DROP COLUMN "streakFreezesLeft";
ALTER TABLE "UserSettings" DROP COLUMN "freezesRenewedAt";

UPDATE "CardProgress"
SET "lastReviewedAt" = "due" - ("stability" * interval '1 day')
WHERE "reps" > 0 AND "lastReviewedAt" IS NULL;
