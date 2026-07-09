-- Домашник, волна 1: Deck/FillTask/QuizTask → Exam/Card(4 формата), Leitner → FSRS.
-- Миграция с переливкой данных: id колод и карточек сохраняются (публичные ссылки и ChatMessage живут).

-- === 1. Отвязываем ChatMessage от старой Card и убираем старые таблицы с пути ===

ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_cardId_fkey";

ALTER TABLE "Card" RENAME TO "_OldCard";
ALTER TABLE "CardProgress" RENAME TO "_OldCardProgress";
ALTER TABLE "Review" RENAME TO "_OldReview";

-- Имена pkey-индексов глобальны в схеме — освобождаем их для новых таблиц.
ALTER TABLE "_OldCard" RENAME CONSTRAINT "Card_pkey" TO "_OldCard_pkey";
ALTER TABLE "_OldCardProgress" RENAME CONSTRAINT "CardProgress_pkey" TO "_OldCardProgress_pkey";
ALTER TABLE "_OldReview" RENAME CONSTRAINT "Review_pkey" TO "_OldReview_pkey";

-- Вторичные индексы старых таблиц больше не нужны (часть имён конфликтует с новыми).
DROP INDEX "Card_deckId_dueAt_idx";
DROP INDEX "CardProgress_userId_dueAt_idx";
DROP INDEX "CardProgress_userId_cardId_key";
DROP INDEX "CardProgress_cardId_idx";
DROP INDEX "Review_deckId_reviewedAt_idx";
DROP INDEX "Review_userId_reviewedAt_idx";

-- === 2. Новые таблицы ===

CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "examDate" TIMESTAMP(3),
    "targetGrade" TEXT,
    "dailyMinutes" INTEGER NOT NULL DEFAULT 25,
    "examFormat" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "generationError" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'long',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "topic" TEXT,
    "answerMd" TEXT,
    "covered" BOOLEAN NOT NULL DEFAULT true,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "sourceRef" TEXT,
    "examId" TEXT NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "options" TEXT[],
    "explanation" TEXT,
    "deepMd" TEXT,
    "mnemonic" TEXT,
    "sourceRef" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "examId" TEXT NOT NULL,
    "questionId" TEXT,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CardProgress" (
    "id" TEXT NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "due" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "state" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "masteredDays" INTEGER NOT NULL DEFAULT 0,
    "priority" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,

    CONSTRAINT "CardProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "confidence" INTEGER,
    "answerText" TEXT,
    "aiVerdict" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'daily',
    "durationMs" INTEGER,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForecastCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "predictedPercent" INTEGER NOT NULL,
    "actualPercent" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "examId" TEXT NOT NULL,

    CONSTRAINT "ForecastCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeachSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT,
    "summaryMd" TEXT,
    "voice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,

    CONSTRAINT "TeachSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeachTurn" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "TeachTurn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConceptMap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "examId" TEXT NOT NULL,

    CONSTRAINT "ConceptMap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryPalace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "loci" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "examId" TEXT NOT NULL,
    "cardId" TEXT,

    CONSTRAINT "MemoryPalace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnxietyDump" (
    "id" TEXT NOT NULL,
    "examId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AnxietyDump_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExamFavorite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,

    CONSTRAINT "ExamFavorite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL,
    "dailyMinutesTotal" INTEGER NOT NULL DEFAULT 25,
    "restWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "streakFreezesLeft" INTEGER NOT NULL DEFAULT 2,
    "freezesRenewedAt" TIMESTAMP(3),
    "bedtimeHour" INTEGER,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- === 3. Переливка данных ===

-- Deck → Exam: id сохраняется (редиректы и публичные ссылки бесплатно); дата экзамена неизвестна (режим поддержки);
-- незавершённые генерации становятся failed с пояснением.
INSERT INTO "Exam" ("id", "title", "description", "examDate", "status", "generationError", "isPublic", "createdAt", "updatedAt", "userId")
SELECT
    d."id",
    d."title",
    d."description",
    NULL,
    CASE WHEN d."status" = 'ready' THEN 'ready' ELSE 'failed' END,
    CASE WHEN d."status" = 'ready' THEN NULL ELSE 'Пересоздано при обновлении приложения' END,
    d."isPublic",
    d."createdAt",
    d."updatedAt",
    d."userId"
FROM "Deck" d;

-- Card(old) → Card(new): id сохраняется, format="open"; легаси SRS-поля отбрасываются.
INSERT INTO "Card" ("id", "format", "prompt", "answer", "options", "deepMd", "position", "createdAt", "updatedAt", "examId")
SELECT
    c."id",
    'open',
    c."question",
    c."answer",
    ARRAY[]::TEXT[],
    c."answerDeep",
    c."position",
    c."createdAt",
    c."updatedAt",
    c."deckId"
FROM "_OldCard" c;

-- FillTask → Card(cloze): варианты = дистракторы + правильный ответ (перемешиваются при выдаче);
-- позиции — в конец экзамена.
WITH card_tail AS (
    SELECT "examId", MAX("position") AS max_position FROM "Card" GROUP BY "examId"
)
INSERT INTO "Card" ("id", "format", "prompt", "answer", "options", "suspended", "position", "createdAt", "updatedAt", "examId")
SELECT
    f."id",
    'cloze',
    f."prompt",
    f."answer",
    array_append(f."distractors", f."answer"),
    f."hidden",
    COALESCE(tail.max_position, -1) + ROW_NUMBER() OVER (PARTITION BY f."deckId" ORDER BY f."position", f."id"),
    f."createdAt",
    f."updatedAt",
    f."deckId"
FROM "FillTask" f
LEFT JOIN card_tail tail ON tail."examId" = f."deckId";

-- QuizTask → Card(mcq): answer = текст правильного варианта (postgres-массивы 1-based: correctIndex + 1);
-- строки с битым correctIndex не переносим (answer было бы NULL).
WITH card_tail AS (
    SELECT "examId", MAX("position") AS max_position FROM "Card" GROUP BY "examId"
)
INSERT INTO "Card" ("id", "format", "prompt", "answer", "options", "explanation", "suspended", "position", "createdAt", "updatedAt", "examId")
SELECT
    q."id",
    'mcq',
    q."question",
    q."options"[q."correctIndex" + 1],
    q."options",
    q."explanation",
    q."hidden",
    COALESCE(tail.max_position, -1) + ROW_NUMBER() OVER (PARTITION BY q."deckId" ORDER BY q."position", q."id"),
    q."createdAt",
    q."updatedAt",
    q."deckId"
FROM "QuizTask" q
LEFT JOIN card_tail tail ON tail."examId" = q."deckId"
WHERE q."correctIndex" >= 0 AND q."correctIndex" < COALESCE(array_length(q."options", 1), 0);

-- CardProgress: Leitner/SM-2 → FSRS. stability ≈ текущий интервал (минимум полдня),
-- difficulty — линейное отображение ease 3.0..1.3 → 1..10, состояние: было хоть одно повторение → Review.
INSERT INTO "CardProgress" ("id", "stability", "difficulty", "due", "state", "reps", "lapses", "lastReviewedAt", "userId", "cardId")
SELECT
    p."id",
    GREATEST(p."intervalDays", 0.5),
    LEAST(GREATEST((3.0 - p."ease") / 1.7 * 9 + 1, 1), 10),
    p."dueAt",
    CASE WHEN p."reps" = 0 THEN 0 ELSE 2 END,
    p."reps",
    p."wrongCount",
    p."lastReviewedAt",
    p."userId",
    p."cardId"
FROM "_OldCardProgress" p;

-- Review: good → 3 (Good) / again → 1 (Again).
INSERT INTO "Review" ("id", "rating", "correct", "mode", "reviewedAt", "cardId", "userId", "examId")
SELECT
    r."id",
    CASE WHEN r."grade" = 'good' THEN 3 ELSE 1 END,
    r."grade" = 'good',
    'daily',
    r."reviewedAt",
    r."cardId",
    r."userId",
    r."deckId"
FROM "_OldReview" r;

-- DeckFavorite → ExamFavorite.
INSERT INTO "ExamFavorite" ("id", "createdAt", "userId", "examId")
SELECT df."id", df."createdAt", df."userId", df."deckId"
FROM "DeckFavorite" df;

-- === 4. Индексы и внешние ключи (после переливки — заодно валидация данных) ===

CREATE INDEX "Exam_userId_idx" ON "Exam"("userId");
CREATE INDEX "Question_examId_position_idx" ON "Question"("examId", "position");
CREATE INDEX "Card_examId_position_idx" ON "Card"("examId", "position");
CREATE UNIQUE INDEX "CardProgress_userId_cardId_key" ON "CardProgress"("userId", "cardId");
CREATE INDEX "CardProgress_userId_due_idx" ON "CardProgress"("userId", "due");
CREATE INDEX "Review_userId_reviewedAt_idx" ON "Review"("userId", "reviewedAt");
CREATE INDEX "Review_examId_reviewedAt_idx" ON "Review"("examId", "reviewedAt");
CREATE INDEX "Review_cardId_idx" ON "Review"("cardId");
CREATE INDEX "ForecastCheck_userId_createdAt_idx" ON "ForecastCheck"("userId", "createdAt");
CREATE INDEX "TeachSession_userId_createdAt_idx" ON "TeachSession"("userId", "createdAt");
CREATE INDEX "TeachTurn_sessionId_createdAt_idx" ON "TeachTurn"("sessionId", "createdAt");
CREATE INDEX "ConceptMap_userId_idx" ON "ConceptMap"("userId");
CREATE INDEX "MemoryPalace_userId_idx" ON "MemoryPalace"("userId");
CREATE INDEX "AnxietyDump_userId_createdAt_idx" ON "AnxietyDump"("userId", "createdAt");
CREATE INDEX "ExamFavorite_examId_idx" ON "ExamFavorite"("examId");
CREATE UNIQUE INDEX "ExamFavorite_userId_examId_key" ON "ExamFavorite"("userId", "examId");
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

ALTER TABLE "Exam" ADD CONSTRAINT "Exam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Material" ADD CONSTRAINT "Material_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CardProgress" ADD CONSTRAINT "CardProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardProgress" ADD CONSTRAINT "CardProgress_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ForecastCheck" ADD CONSTRAINT "ForecastCheck_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeachSession" ADD CONSTRAINT "TeachSession_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeachTurn" ADD CONSTRAINT "TeachTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TeachSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConceptMap" ADD CONSTRAINT "ConceptMap_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryPalace" ADD CONSTRAINT "MemoryPalace_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryPalace" ADD CONSTRAINT "MemoryPalace_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnxietyDump" ADD CONSTRAINT "AnxietyDump_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamFavorite" ADD CONSTRAINT "ExamFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamFavorite" ADD CONSTRAINT "ExamFavorite_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ChatMessage переезжает на новую Card (id карточек совпадают — данные не трогаем).
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- === 5. Старые таблицы больше не нужны ===

DROP TABLE "_OldReview";
DROP TABLE "_OldCardProgress";
DROP TABLE "FillTask";
DROP TABLE "QuizTask";
DROP TABLE "DeckFavorite";
DROP TABLE "_OldCard";
DROP TABLE "Deck";
