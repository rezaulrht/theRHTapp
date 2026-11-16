-- CreateTable
CREATE TABLE "VaultFolder" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "pinnedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "trashedAt" TIMESTAMP(3),
    "trashRootId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultItem" (
    "id" TEXT NOT NULL,
    "folderId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "body" TEXT,
    "url" TEXT,
    "fileKey" TEXT,
    "fileSize" BIGINT,
    "mimeType" TEXT,
    "uploaded" BOOLEAN NOT NULL DEFAULT true,
    "pinnedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "trashedAt" TIMESTAMP(3),
    "trashRootId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VaultItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'brass',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultItemTag" (
    "itemId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "VaultItemTag_pkey" PRIMARY KEY ("itemId","tagId")
);

-- CreateTable
CREATE TABLE "VaultField" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "choices" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultFieldValue" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "folderId" TEXT,
    "itemId" TEXT,
    "value" JSONB NOT NULL,

    CONSTRAINT "VaultFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaultTodo" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "dueDate" DATE,
    "remind" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaultTodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaultFolder_parentId_idx" ON "VaultFolder"("parentId");

-- CreateIndex
CREATE INDEX "VaultFolder_trashRootId_idx" ON "VaultFolder"("trashRootId");

-- CreateIndex
CREATE INDEX "VaultItem_folderId_idx" ON "VaultItem"("folderId");

-- CreateIndex
CREATE INDEX "VaultItem_trashRootId_idx" ON "VaultItem"("trashRootId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultTag_name_key" ON "VaultTag"("name");

-- CreateIndex
CREATE INDEX "VaultItemTag_tagId_idx" ON "VaultItemTag"("tagId");

-- CreateIndex
CREATE INDEX "VaultFieldValue_folderId_idx" ON "VaultFieldValue"("folderId");

-- CreateIndex
CREATE INDEX "VaultFieldValue_itemId_idx" ON "VaultFieldValue"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultFieldValue_fieldId_folderId_key" ON "VaultFieldValue"("fieldId", "folderId");

-- CreateIndex
CREATE UNIQUE INDEX "VaultFieldValue_fieldId_itemId_key" ON "VaultFieldValue"("fieldId", "itemId");

-- CreateIndex
CREATE INDEX "VaultTodo_folderId_idx" ON "VaultTodo"("folderId");

-- AddForeignKey
ALTER TABLE "VaultFolder" ADD CONSTRAINT "VaultFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "VaultFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultItem" ADD CONSTRAINT "VaultItem_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "VaultFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultItemTag" ADD CONSTRAINT "VaultItemTag_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultItemTag" ADD CONSTRAINT "VaultItemTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "VaultTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultFieldValue" ADD CONSTRAINT "VaultFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "VaultField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultFieldValue" ADD CONSTRAINT "VaultFieldValue_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "VaultFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultFieldValue" ADD CONSTRAINT "VaultFieldValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultTodo" ADD CONSTRAINT "VaultTodo_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "VaultFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
