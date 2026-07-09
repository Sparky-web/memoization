-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "aiCheckEnabled" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "bedtimeHour" SET DEFAULT 21;

-- Существующие строки создавались до появления настройки напоминания: null означал «не настроено»,
-- а подсказка показывалась всем с 21:00. Переносим это поведение в явное значение — null теперь «выключено».
UPDATE "UserSettings" SET "bedtimeHour" = 21 WHERE "bedtimeHour" IS NULL;
