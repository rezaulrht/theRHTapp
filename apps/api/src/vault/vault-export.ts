import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type ExportContributor, ExportService } from '../export/export.service';
import { PrismaService } from '../prisma/prisma.service';

/** The Vault's share of the data export: everything except the file bytes, which stay in storage. */
@Injectable()
export class VaultExportService implements OnModuleInit, ExportContributor {
  readonly key = 'vault';

  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ExportService,
  ) {}

  onModuleInit(): void {
    this.exporter.register(this);
  }

  async export(): Promise<unknown> {
    const [folders, items, tags, itemTags, fields, values, todos] = await Promise.all([
      this.prisma.vaultFolder.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.vaultItem.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.vaultTag.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.vaultItemTag.findMany(),
      this.prisma.vaultField.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.vaultFieldValue.findMany(),
      this.prisma.vaultTodo.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      folders,
      // JSON has no big integers; file sizes fit comfortably in a number.
      items: items.map((item) => ({ ...item, fileSize: item.fileSize === null ? null : Number(item.fileSize) })),
      tags,
      itemTags,
      fields,
      values,
      todos,
    };
  }
}
