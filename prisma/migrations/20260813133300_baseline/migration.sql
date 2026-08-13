-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "GmailSyncStatus" AS ENUM ('NONE', 'REQUESTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('HOUSE_MAINTENANCE', 'LOAN', 'CHIT_FUND', 'CREDIT_CARD', 'SAVINGS', 'PERSONAL', 'MISCELLANEOUS', 'SALARY', 'FREELANCE', 'RENTAL', 'BUSINESS', 'INVESTMENTS', 'OTHER_INCOME');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "AdHocType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ReceivableCategory" AS ENUM ('INVESTMENT', 'PERSONAL_LOAN', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('PENDING', 'RECEIVED');

-- CreateEnum
CREATE TYPE "ParsedTransactionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ParsedTransactionPaymentMethod" AS ENUM ('CREDIT_CARD', 'UPI', 'DEBIT_CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "ParsedTransactionType" AS ENUM ('DEBIT', 'CREDIT', 'REFUND');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planType" TEXT NOT NULL DEFAULT 'FREE',
    "planExpiry" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "gmailSyncStatus" "GmailSyncStatus" NOT NULL DEFAULT 'NONE',
    "gmailSyncRequestedAt" TIMESTAMP(3),
    "activePushTags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "planType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineItemTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "customCategory" TEXT,
    "customCategoryId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "isFixed" BOOLEAN NOT NULL DEFAULT true,
    "dueDateDay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "foreClosedOn" TIMESTAMP(3),
    "foreCloseAmount" DOUBLE PRECISION,
    "pendingAmount" DOUBLE PRECISION,
    "pendingFromMonth" INTEGER,
    "pendingFromYear" INTEGER,
    "statementDay" INTEGER,
    "creditLimit" DOUBLE PRECISION,
    "frequency" "Frequency" NOT NULL DEFAULT 'MONTHLY',
    "dueMonth" INTEGER,
    "templateType" "TemplateType" NOT NULL DEFAULT 'EXPENSE',
    "endsOnMonth" INTEGER,
    "endsOnYear" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "loanOriginalPrincipal" DOUBLE PRECISION,
    "loanInterestRate" DOUBLE PRECISION,
    "loanRateType" TEXT,
    "loanStartDate" TIMESTAMP(3),
    "loanOutstandingOverride" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineItemTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Month" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "salaryIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freelanceIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carriedDebtPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPopulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Month_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyEntry" (
    "id" TEXT NOT NULL,
    "monthId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidOn" TIMESTAMP(3),
    "paidAmount" DOUBLE PRECISION,
    "cashbackAmount" DOUBLE PRECISION,
    "notes" TEXT,
    "statementAmount" DOUBLE PRECISION,
    "billedAmount" DOUBLE PRECISION,
    "carriedInAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidViaCardTemplateId" TEXT,
    "billPaymentsAttributed" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "MonthlyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarriedDebtSettlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "billMonth" INTEGER NOT NULL,
    "billYear" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "settledOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarriedDebtSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChitFund" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalValue" DOUBLE PRECISION NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "monthlyUnliftedAmount" DOUBLE PRECISION NOT NULL,
    "monthlyLiftedAmount" DOUBLE PRECISION,
    "isLifted" BOOLEAN NOT NULL DEFAULT false,
    "liftedOn" TIMESTAMP(3),
    "liftedAmount" DOUBLE PRECISION,
    "liftedUsedFor" TEXT,
    "accumulatedSavings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftIncomeItemId" TEXT,

    CONSTRAINT "ChitFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bank" TEXT,
    "network" TEXT,
    "last4" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdHocItem" (
    "id" TEXT NOT NULL,
    "monthId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" "AdHocType" NOT NULL,
    "category" "Category",
    "customCategory" TEXT,
    "customCategoryId" TEXT,
    "subCategory" TEXT,
    "ccTemplateId" TEXT,
    "isCredit" BOOLEAN NOT NULL DEFAULT false,
    "isCardRepayment" BOOLEAN NOT NULL DEFAULT false,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdHocItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ReceivableCategory" NOT NULL,
    "customCategory" TEXT,
    "customCategoryId" TEXT,
    "description" TEXT NOT NULL,
    "expectedAmount" DOUBLE PRECISION NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "status" "ReceivableStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAmount" DOUBLE PRECISION,
    "receivedDate" TIMESTAMP(3),
    "receivedMonthId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiry" TIMESTAMP(3) NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "historyId" TEXT,
    "watchExpiration" TIMESTAMP(3),
    "needsReauth" BOOLEAN NOT NULL DEFAULT false,
    "reminderSentAt" TIMESTAMP(3),

    CONSTRAINT "GmailConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParsedTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "originalCurrency" TEXT,
    "originalAmount" DOUBLE PRECISION,
    "merchant" TEXT,
    "last4" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "transactionTime" TEXT,
    "emailReceivedAt" TIMESTAMP(3),
    "rawSnippet" TEXT NOT NULL,
    "status" "ParsedTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "ParsedTransactionPaymentMethod" NOT NULL DEFAULT 'CREDIT_CARD',
    "transactionType" "ParsedTransactionType" NOT NULL DEFAULT 'DEBIT',
    "suggestedCcTemplateId" TEXT,
    "suggestedSubcategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParsedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantCategoryMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "category" "Category",
    "customCategoryId" TEXT,
    "subCategory" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCategoryMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailSeenMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GmailSeenMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeminiUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "batchSize" INTEGER NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "candidatesTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeminiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailSenderReputation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "notTxnStreak" INTEGER NOT NULL DEFAULT 0,
    "totalSeen" INTEGER NOT NULL DEFAULT 0,
    "totalTxn" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailSenderReputation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CustomCategory_userId_name_key" ON "CustomCategory"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_razorpayOrderId_key" ON "Payment"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Month_userId_month_year_key" ON "Month"("userId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyEntry_monthId_templateId_key" ON "MonthlyEntry"("monthId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ChitFund_templateId_key" ON "ChitFund"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ChitFund_liftIncomeItemId_key" ON "ChitFund"("liftIncomeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCard_templateId_key" ON "CreditCard"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "GmailConnection_userId_key" ON "GmailConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ParsedTransaction_userId_gmailMessageId_key" ON "ParsedTransaction"("userId", "gmailMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCategoryMemory_userId_merchantKey_key" ON "MerchantCategoryMemory"("userId", "merchantKey");

-- CreateIndex
CREATE UNIQUE INDEX "GmailSeenMessage_userId_gmailMessageId_key" ON "GmailSeenMessage"("userId", "gmailMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "GmailSenderReputation_userId_senderEmail_key" ON "GmailSenderReputation"("userId", "senderEmail");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomCategory" ADD CONSTRAINT "CustomCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItemTemplate" ADD CONSTRAINT "LineItemTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineItemTemplate" ADD CONSTRAINT "LineItemTemplate_customCategoryId_fkey" FOREIGN KEY ("customCategoryId") REFERENCES "CustomCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Month" ADD CONSTRAINT "Month_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyEntry" ADD CONSTRAINT "MonthlyEntry_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "Month"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyEntry" ADD CONSTRAINT "MonthlyEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LineItemTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyEntry" ADD CONSTRAINT "MonthlyEntry_paidViaCardTemplateId_fkey" FOREIGN KEY ("paidViaCardTemplateId") REFERENCES "LineItemTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarriedDebtSettlement" ADD CONSTRAINT "CarriedDebtSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarriedDebtSettlement" ADD CONSTRAINT "CarriedDebtSettlement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LineItemTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChitFund" ADD CONSTRAINT "ChitFund_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LineItemTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChitFund" ADD CONSTRAINT "ChitFund_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChitFund" ADD CONSTRAINT "ChitFund_liftIncomeItemId_fkey" FOREIGN KEY ("liftIncomeItemId") REFERENCES "AdHocItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LineItemTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHocItem" ADD CONSTRAINT "AdHocItem_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "Month"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHocItem" ADD CONSTRAINT "AdHocItem_customCategoryId_fkey" FOREIGN KEY ("customCategoryId") REFERENCES "CustomCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdHocItem" ADD CONSTRAINT "AdHocItem_ccTemplateId_fkey" FOREIGN KEY ("ccTemplateId") REFERENCES "LineItemTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_customCategoryId_fkey" FOREIGN KEY ("customCategoryId") REFERENCES "CustomCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "Receivable_receivedMonthId_fkey" FOREIGN KEY ("receivedMonthId") REFERENCES "Month"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailConnection" ADD CONSTRAINT "GmailConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParsedTransaction" ADD CONSTRAINT "ParsedTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCategoryMemory" ADD CONSTRAINT "MerchantCategoryMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCategoryMemory" ADD CONSTRAINT "MerchantCategoryMemory_customCategoryId_fkey" FOREIGN KEY ("customCategoryId") REFERENCES "CustomCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailSeenMessage" ADD CONSTRAINT "GmailSeenMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeminiUsageLog" ADD CONSTRAINT "GeminiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailSenderReputation" ADD CONSTRAINT "GmailSenderReputation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

