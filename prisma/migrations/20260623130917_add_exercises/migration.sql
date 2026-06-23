-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "exercisesError" TEXT,
ADD COLUMN     "exercisesStatus" TEXT NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE "FillTask" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "distractors" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deckId" TEXT NOT NULL,

    CONSTRAINT "FillTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizTask" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3),
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deckId" TEXT NOT NULL,

    CONSTRAINT "QuizTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FillTask_deckId_hidden_idx" ON "FillTask"("deckId", "hidden");

-- CreateIndex
CREATE INDEX "QuizTask_deckId_hidden_idx" ON "QuizTask"("deckId", "hidden");

-- AddForeignKey
ALTER TABLE "FillTask" ADD CONSTRAINT "FillTask_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizTask" ADD CONSTRAINT "QuizTask_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
