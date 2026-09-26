-- CreateTable
CREATE TABLE "OrderSequence" (
    "orgId" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "OrderSequence_pkey" PRIMARY KEY ("orgId")
);

-- AddForeignKey
ALTER TABLE "OrderSequence" ADD CONSTRAINT "OrderSequence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
