-- CreateEnum
CREATE TYPE "ParsedTransactionKind" AS ENUM ('TRANSACTION', 'STATEMENT');

-- AlterTable
ALTER TABLE "ParsedTransaction" ADD COLUMN     "kind" "ParsedTransactionKind" NOT NULL DEFAULT 'TRANSACTION',
ADD COLUMN     "statementDueDate" TIMESTAMP(3);
