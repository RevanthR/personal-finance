-- CreateTable
CREATE TABLE "CardStatement" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "paymentDueDate" TIMESTAMP(3) NOT NULL,
    "statementBalance" DOUBLE PRECISION,
    "confirmedAt" TIMESTAMP(3),
    "confirmedVia" TEXT,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidInFull" BOOLEAN NOT NULL DEFAULT false,
    "cashback" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardStatement_userId_idx" ON "CardStatement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatement_cardId_statementDate_key" ON "CardStatement"("cardId", "statementDate");

-- AddForeignKey
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
