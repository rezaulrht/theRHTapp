-- CreateTable
CREATE TABLE "HabitItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "timing" JSONB NOT NULL,
    "appliesTo" JSONB NOT NULL,
    "lateShare" DOUBLE PRECISION,
    "missMultiplier" DOUBLE PRECISION,
    "reminders" JSONB NOT NULL,
    "ignoreQuietHours" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pausedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitDay" (
    "day" DATE NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "skippedReason" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "HabitDay_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "HabitDayItem" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "lateShare" DOUBLE PRECISION NOT NULL,
    "missMultiplier" DOUBLE PRECISION NOT NULL,
    "timing" JSONB NOT NULL,
    "opensAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT,
    "score" INTEGER,

    CONSTRAINT "HabitDayItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitMark" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "itemId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabitDayItem_itemId_idx" ON "HabitDayItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitDayItem_day_itemId_key" ON "HabitDayItem"("day", "itemId");

-- CreateIndex
CREATE INDEX "HabitMark_day_itemId_idx" ON "HabitMark"("day", "itemId");

-- AddForeignKey
ALTER TABLE "HabitDayItem" ADD CONSTRAINT "HabitDayItem_day_fkey" FOREIGN KEY ("day") REFERENCES "HabitDay"("day") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitDayItem" ADD CONSTRAINT "HabitDayItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HabitItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitMark" ADD CONSTRAINT "HabitMark_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HabitItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
