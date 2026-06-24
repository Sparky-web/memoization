-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CardProgress" (
    "id" TEXT NOT NULL,
    "box" INTEGER NOT NULL DEFAULT 0,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,

    CONSTRAINT "CardProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckFavorite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,

    CONSTRAINT "DeckFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardProgress_userId_dueAt_idx" ON "CardProgress"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "CardProgress_cardId_idx" ON "CardProgress"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "CardProgress_userId_cardId_key" ON "CardProgress"("userId", "cardId");

-- CreateIndex
CREATE INDEX "DeckFavorite_userId_idx" ON "DeckFavorite"("userId");

-- CreateIndex
CREATE INDEX "DeckFavorite_deckId_idx" ON "DeckFavorite"("deckId");

-- CreateIndex
CREATE UNIQUE INDEX "DeckFavorite_userId_deckId_key" ON "DeckFavorite"("userId", "deckId");

-- AddForeignKey
ALTER TABLE "CardProgress" ADD CONSTRAINT "CardProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardProgress" ADD CONSTRAINT "CardProgress_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckFavorite" ADD CONSTRAINT "DeckFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckFavorite" ADD CONSTRAINT "DeckFavorite_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Перенос исторического прогресса повторения владельцев колод в CardProgress.
-- Берём только реально проучённые карточки (reps > 0): непройденные остаются без строки = «новые» и сразу к показу.
INSERT INTO "CardProgress" ("id", "box", "ease", "intervalDays", "dueAt", "reps", "correctCount", "wrongCount", "streak", "lastReviewedAt", "createdAt", "updatedAt", "userId", "cardId")
SELECT 'cp_' || c."id", c."box", c."ease", c."intervalDays", c."dueAt", c."reps", c."correctCount", c."wrongCount", c."streak", c."lastReviewedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, d."userId", c."id"
FROM "Card" c
JOIN "Deck" d ON d."id" = c."deckId"
WHERE c."reps" > 0;
