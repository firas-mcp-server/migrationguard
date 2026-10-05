SET lock_timeout = '5s';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
