-- AlterTable
ALTER TABLE "User" ADD COLUMN     "payDay" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "CashPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidOn" TIMESTAMP(3) NOT NULL,
    "monthlyEntryId" TEXT,
    "cardStatementId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashAnchor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashPayment_userId_paidOn_idx" ON "CashPayment"("userId", "paidOn");

-- CreateIndex
CREATE INDEX "CashAnchor_userId_asOf_idx" ON "CashAnchor"("userId", "asOf");

-- AddForeignKey
ALTER TABLE "CashPayment" ADD CONSTRAINT "CashPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashPayment" ADD CONSTRAINT "CashPayment_monthlyEntryId_fkey" FOREIGN KEY ("monthlyEntryId") REFERENCES "MonthlyEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashPayment" ADD CONSTRAINT "CashPayment_cardStatementId_fkey" FOREIGN KEY ("cardStatementId") REFERENCES "CardStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashAnchor" ADD CONSTRAINT "CashAnchor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
