-- CreateEnum
CREATE TYPE "PromptCategory" AS ENUM ('CHAOS_CHAT', 'WELCOME_MESSAGE');

-- AlterTable
ALTER TABLE "Prompt" ADD COLUMN     "category" "PromptCategory" NOT NULL DEFAULT 'CHAOS_CHAT';
