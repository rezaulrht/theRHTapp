import { BadRequestException, Controller, Get, Injectable, Query } from '@nestjs/common';
import { fieldValueText } from '@pa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FieldsService } from './fields';
import { FoldersService, ITEM_INCLUDE, type FolderJson, type ItemJson } from './folders';

export type Matched = 'name' | 'note' | 'link' | 'tag' | 'field';

const LIMIT = 50;
const MAX_QUERY = 200;

/**
 * One search over names, note text, link titles and addresses, tags and field
 * values. File contents are not searched.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly folders: FoldersService,
    private readonly fields: FieldsService,
  ) {}

  async search(query: string): Promise<{
    folders: (FolderJson & { matched: Matched })[];
    items: (ItemJson & { matched: Matched })[];
  }> {
    const q = query.trim();
    if (q === '') return { folders: [], items: [] };
    const needle = q.toLowerCase();
    const has = (text: string | null | undefined) => (text ?? '').toLowerCase().includes(needle);
    const contains = { contains: q, mode: 'insensitive' as const };

    // Field values are few at personal scale and stored as JSON, so they are matched here.
    const defs = new Map((await this.fields.defs()).map((def) => [def.id, def]));
    const values = await this.prisma.vaultFieldValue.findMany();
    const byFolder = new Set<string>();
    const byItem = new Set<string>();
    for (const row of values) {
      if (!has(fieldValueText(defs.get(row.fieldId), row.value))) continue;
      if (row.folderId) byFolder.add(row.folderId);
      if (row.itemId) byItem.add(row.itemId);
    }

    const [folderRows, itemRows] = await Promise.all([
      this.prisma.vaultFolder.findMany({
        where: { trashedAt: null, OR: [{ name: contains }, { id: { in: [...byFolder] } }] },
        include: { values: true },
        orderBy: { updatedAt: 'desc' },
        take: LIMIT,
      }),
      this.prisma.vaultItem.findMany({
        where: {
          trashedAt: null,
          uploaded: true,
          OR: [
            { name: contains },
            { body: contains },
            { url: contains },
            { tags: { some: { tag: { name: contains } } } },
            { id: { in: [...byItem] } },
          ],
        },
        include: { ...ITEM_INCLUDE, tags: { include: { tag: true } } },
        orderBy: { updatedAt: 'desc' },
        take: LIMIT,
      }),
    ]);

    const map = await this.folders.folderMap();
    return {
      folders: folderRows.map((row) => ({ ...this.folders.folderJson(row, map), matched: has(row.name) ? 'name' : 'field' })),
      items: itemRows.map((row) => {
        const matched: Matched = has(row.name)
          ? 'name'
          : row.kind === 'note' && has(row.body)
            ? 'note'
            : row.kind === 'link' && has(row.url)
              ? 'link'
              : row.tags.some((link) => has(link.tag.name))
                ? 'tag'
                : 'field';
        return { ...this.folders.itemJson(row, map), matched };
      }),
    };
  }
}

@Controller('vault')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get('search')
  search(@Query('q') q?: string) {
    if ((q ?? '').length > MAX_QUERY) throw new BadRequestException('Use a shorter search');
    return this.service.search(q ?? '');
  }
}
