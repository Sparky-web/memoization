-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "answerDeep" TEXT;

-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "generationError" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ready';
