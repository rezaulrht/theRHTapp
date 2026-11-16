import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Prisma, VaultFolder, VaultItem, VaultTodo } from '@pa/db';
import { compareByField, FILTER_OPS, matchesFilters, wouldCreateLoop, type FieldDef, type FieldFilter, type FieldType } from '@pa/shared';
import { z } from 'zod';
import { fieldError, fromDbDate } from '../money/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../zod-validation.pipe';

export const ROOT = 'root';

export interface PathStep {
  id: string;
  name: string;
}

export interface FolderJson {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  pinned: boolean;
  /** From the top level down to this folder, itself included. */
  path: PathStep[];
  values: Record<string, unknown>;
  updatedAt: string;
}

export interface ItemJson {
  id: string;
  folderId: string | null;
  kind: 'file' | 'note' | 'link';
  name: string;
  sortOrder: number;
  pinned: boolean;
  /** A note's full text: only when one item is fetched. */
  body: string | null;
  /** The start of a note, for lists. */
  excerpt: string | null;
  url: string | null;
  file: { size: number; mimeType: string; uploaded: boolean } | null;
  tagIds: string[];
  values: Record<string, unknown>;
  /** The folders it sits in, top level first. */
  path: PathStep[];
  createdAt: string;
  updatedAt: string;
}

export interface TodoJson {
  id: string;
  folderId: string;
  text: string;
  dueDate: string | null;
  remind: boolean;
  done: boolean;
  sortOrder: number;
}

export const ITEM_INCLUDE = { tags: true, values: true } as const;
export type ItemRow = VaultItem & Prisma.VaultItemGetPayload<{ include: typeof ITEM_INCLUDE }>;
type FolderRow = VaultFolder & { values?: { fieldId: string; value: unknown }[] };

const EXCERPT = 160;

export interface ListOptions {
  filters: FieldFilter[];
  /** The owner's own order when not given. */
  sort?: 'name' | 'updated' | `field:${string}`;
  descending: boolean;
}
export const MAX_NOTE = 1_000_000;

export const vaultNameSchema = z.string('Enter a name').trim().min(1, 'Enter a name').max(200, 'Use a shorter name');
const parentSchema = z.string().min(1).nullable();
const webAddress = z
  .string('Enter a web address')
  .trim()
  .refine((text) => {
    try {
      const url = new URL(text);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a web address starting with http:// or https://');
const noteBody = z.string().max(MAX_NOTE, 'That note is too long');

const createFolderSchema = z.object({ parentId: parentSchema, name: vaultNameSchema });
const updateFolderSchema = z.object({ name: vaultNameSchema.optional(), pinned: z.boolean().optional() });
const createItemSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('note'), folderId: parentSchema, name: vaultNameSchema, body: noteBody.optional() }),
    z.object({ kind: z.literal('link'), folderId: parentSchema, name: vaultNameSchema, url: webAddress }),
  ],
  'Pick note or link',
);
const updateItemSchema = z.object({
  name: vaultNameSchema.optional(),
  body: noteBody.optional(),
  url: webAddress.optional(),
  pinned: z.boolean().optional(),
});
const moveSchema = z.object({
  folderIds: z.array(z.string().min(1)).default([]),
  itemIds: z.array(z.string().min(1)).default([]),
  targetId: parentSchema,
});
const reorderSchema = z.object({
  folderIds: z.array(z.string().min(1)).default([]),
  itemIds: z.array(z.string().min(1)).default([]),
});

function valuesOf(rows: { fieldId: string; value: unknown }[] | undefined): Record<string, unknown> {
  return Object.fromEntries((rows ?? []).map((row) => [row.fieldId, row.value]));
}

export function todoToJson(row: VaultTodo): TodoJson {
  return {
    id: row.id,
    folderId: row.folderId,
    text: row.text,
    dueDate: row.dueDate ? fromDbDate(row.dueDate) : null,
    remind: row.remind,
    done: row.doneAt !== null,
    sortOrder: row.sortOrder,
  };
}

/** Filters and sorts a listing by field values, name or last change. */
function arrange<T extends { name: string; values: Record<string, unknown>; updatedAt?: string }>(
  list: T[],
  options: ListOptions,
  defs: FieldDef[],
): T[] {
  const kept = list.filter((entry) => matchesFilters(entry.values, options.filters, defs));
  if (!options.sort) return kept;
  const field = options.sort.startsWith('field:') ? defs.find((def) => `field:${def.id}` === options.sort) : undefined;
  const compare = (a: T, b: T): number => {
    if (options.sort === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    if (options.sort === 'updated') return (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '');
    return field ? compareByField(a.values, b.values, field) : 0;
  };
  const sorted = [...kept].sort(compare);
  if (!options.descending) return sorted;
  // Things with no value for the sort field stay at the end either way.
  const missing = field ? sorted.filter((entry) => entry.values[field.id] === undefined) : [];
  return [...sorted.filter((entry) => !missing.includes(entry)).reverse(), ...missing];
}

/** Each folder's parent and name, for building paths and checking moves. */
export class FolderMap {
  constructor(private readonly folders: Map<string, { parentId: string | null; name: string; trashed: boolean }>) {}

  parentOf = (id: string): string | null => this.folders.get(id)?.parentId ?? null;

  has(id: string): boolean {
    return this.folders.has(id);
  }

  live(id: string): boolean {
    const folder = this.folders.get(id);
    return folder !== undefined && !folder.trashed;
  }

  /** From the top level down to `id`, itself included. */
  path(id: string | null): PathStep[] {
    const steps: PathStep[] = [];
    const seen = new Set<string>();
    for (let current = id; current !== null && !seen.has(current); current = this.parentOf(current)) {
      seen.add(current);
      const folder = this.folders.get(current);
      if (!folder) break;
      steps.unshift({ id: current, name: folder.name });
    }
    return steps;
  }

  /** Every folder inside `id`, at any depth. */
  descendants(id: string): string[] {
    const found: string[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [childId, folder] of this.folders) {
        if (folder.parentId === current && !found.includes(childId)) {
          found.push(childId);
          queue.push(childId);
        }
      }
    }
    return found;
  }
}

/** Folders, notes and links: everything in the Vault apart from file bytes. */
@Injectable()
export class FoldersService {
  /** The time now. Tests replace it. */
  clock: () => Date = () => new Date();

  constructor(private readonly prisma: PrismaService) {}

  async folderMap(): Promise<FolderMap> {
    const rows = await this.prisma.vaultFolder.findMany({ select: { id: true, parentId: true, name: true, trashedAt: true } });
    return new FolderMap(new Map(rows.map((row) => [row.id, { parentId: row.parentId, name: row.name, trashed: row.trashedAt !== null }])));
  }

  folderJson(row: FolderRow, map: FolderMap): FolderJson {
    return {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      sortOrder: row.sortOrder,
      pinned: row.pinnedAt !== null,
      path: map.path(row.id),
      values: valuesOf(row.values),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  itemJson(row: ItemRow, map: FolderMap, full = false): ItemJson {
    const kind = row.kind as ItemJson['kind'];
    return {
      id: row.id,
      folderId: row.folderId,
      kind,
      name: row.name,
      sortOrder: row.sortOrder,
      pinned: row.pinnedAt !== null,
      body: full ? (row.body ?? '') : null,
      excerpt: kind === 'note' && row.body ? row.body.slice(0, EXCERPT) : null,
      url: row.url,
      file:
        kind === 'file'
          ? { size: Number(row.fileSize ?? 0), mimeType: row.mimeType ?? 'application/octet-stream', uploaded: row.uploaded }
          : null,
      tagIds: row.tags.map((tag) => tag.tagId),
      values: valuesOf(row.values),
      path: map.path(row.folderId),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** A folder that exists and is not in the trash. */
  async liveFolder(id: string): Promise<VaultFolder> {
    const row = await this.prisma.vaultFolder.findUnique({ where: { id } });
    if (!row || row.trashedAt) throw new NotFoundException('That folder does not exist');
    return row;
  }

  async liveItem(id: string): Promise<ItemRow> {
    const row = await this.prisma.vaultItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!row || row.trashedAt || !row.uploaded) throw new NotFoundException('That item does not exist');
    return row;
  }

  /** A folder id to put things in, checked; null means the top level. */
  async checkParent(id: string | null, path = 'parentId'): Promise<string | null> {
    if (id === null) return null;
    const row = await this.prisma.vaultFolder.findUnique({ where: { id } });
    if (!row || row.trashedAt) throw fieldError(path, 'That folder does not exist');
    return id;
  }

  private async nextOrder(folderId: string | null): Promise<number> {
    const [folders, items] = await Promise.all([
      this.prisma.vaultFolder.aggregate({ where: { parentId: folderId }, _max: { sortOrder: true } }),
      this.prisma.vaultItem.aggregate({ where: { folderId }, _max: { sortOrder: true } }),
    ]);
    return Math.max(folders._max.sortOrder ?? -1, items._max.sortOrder ?? -1) + 1;
  }

  /** A folder's contents. `id` null is the top level. */
  async open(
    id: string | null,
    options: ListOptions = { filters: [], descending: false },
  ): Promise<{ folder: FolderJson | null; folders: FolderJson[]; items: ItemJson[]; todos: TodoJson[] }> {
    if (id !== null) {
      await this.liveFolder(id);
      await this.prisma.vaultFolder.update({ where: { id }, data: { openedAt: this.clock() } });
    }
    const [map, folder, folders, items, todos] = await Promise.all([
      this.folderMap(),
      id === null ? null : this.prisma.vaultFolder.findUnique({ where: { id }, include: { values: true } }),
      this.prisma.vaultFolder.findMany({
        where: { parentId: id, trashedAt: null },
        include: { values: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.vaultItem.findMany({
        where: { folderId: id, trashedAt: null, uploaded: true },
        include: ITEM_INCLUDE,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      id === null
        ? []
        : this.prisma.vaultTodo.findMany({ where: { folderId: id }, orderBy: [{ doneAt: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }, { createdAt: 'asc' }] }),
    ]);
    const listed = {
      folders: folders.map((row) => this.folderJson(row, map)),
      items: items.map((row) => this.itemJson(row, map)),
    };
    if (options.filters.length > 0 || options.sort) {
      const defs: FieldDef[] = (await this.prisma.vaultField.findMany()).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type as FieldType,
        choices: row.choices,
      }));
      listed.folders = arrange(listed.folders, options, defs);
      listed.items = arrange(listed.items, options, defs);
    }
    return { folder: folder ? this.folderJson(folder, map) : null, ...listed, todos: todos.map(todoToJson) };
  }

  async createFolder(parentId: string | null, name: string): Promise<FolderJson> {
    const parent = await this.checkParent(parentId);
    const row = await this.prisma.vaultFolder.create({
      data: { parentId: parent, name, sortOrder: await this.nextOrder(parent), createdAt: this.clock() },
      include: { values: true },
    });
    return this.folderJson(row, await this.folderMap());
  }

  async updateFolder(id: string, input: z.infer<typeof updateFolderSchema>): Promise<FolderJson> {
    const existing = await this.liveFolder(id);
    const row = await this.prisma.vaultFolder.update({
      where: { id },
      data: {
        name: input.name,
        pinnedAt: input.pinned === undefined ? undefined : input.pinned ? (existing.pinnedAt ?? this.clock()) : null,
      },
      include: { values: true },
    });
    return this.folderJson(row, await this.folderMap());
  }

  async createItem(input: z.infer<typeof createItemSchema>): Promise<ItemJson> {
    const folderId = await this.checkParent(input.folderId, 'folderId');
    const row = await this.prisma.vaultItem.create({
      data: {
        folderId,
        kind: input.kind,
        name: input.name,
        body: input.kind === 'note' ? (input.body ?? '') : null,
        url: input.kind === 'link' ? input.url : null,
        sortOrder: await this.nextOrder(folderId),
        createdAt: this.clock(),
      },
      include: ITEM_INCLUDE,
    });
    return this.itemJson(row, await this.folderMap(), true);
  }

  async openItem(id: string): Promise<ItemJson> {
    await this.liveItem(id);
    const row = await this.prisma.vaultItem.update({ where: { id }, data: { openedAt: this.clock() }, include: ITEM_INCLUDE });
    return this.itemJson(row, await this.folderMap(), true);
  }

  async updateItem(id: string, input: z.infer<typeof updateItemSchema>): Promise<ItemJson> {
    const existing = await this.liveItem(id);
    if (input.body !== undefined && existing.kind !== 'note') throw fieldError('body', 'Only a note has text');
    if (input.url !== undefined && existing.kind !== 'link') throw fieldError('url', 'Only a link has an address');
    const row = await this.prisma.vaultItem.update({
      where: { id },
      data: {
        name: input.name,
        body: input.body,
        url: input.url,
        pinnedAt: input.pinned === undefined ? undefined : input.pinned ? (existing.pinnedAt ?? this.clock()) : null,
      },
      include: ITEM_INCLUDE,
    });
    return this.itemJson(row, await this.folderMap(), true);
  }

  /** Moves folders and items into a folder (or the top level). All of them, or none. */
  async move(input: z.infer<typeof moveSchema>): Promise<void> {
    const targetId = await this.checkParent(input.targetId, 'targetId');
    const map = await this.folderMap();
    for (const id of input.folderIds) {
      if (!map.live(id)) throw fieldError('folderIds', 'One of those folders does not exist');
      if (wouldCreateLoop(id, targetId, map.parentOf)) throw fieldError('targetId', 'A folder cannot go inside itself');
    }
    const items = await this.prisma.vaultItem.findMany({ where: { id: { in: input.itemIds }, trashedAt: null } });
    if (items.length !== new Set(input.itemIds).size) throw fieldError('itemIds', 'One of those items does not exist');

    let order = await this.nextOrder(targetId);
    await this.prisma.$transaction([
      ...input.folderIds.map((id) => this.prisma.vaultFolder.update({ where: { id }, data: { parentId: targetId, sortOrder: order++ } })),
      ...input.itemIds.map((id) => this.prisma.vaultItem.update({ where: { id }, data: { folderId: targetId, sortOrder: order++ } })),
    ]);
  }

  /** Puts a folder's contents in the owner's order: folders first, then items. */
  async reorder(id: string | null, input: z.infer<typeof reorderSchema>): Promise<void> {
    if (id !== null) await this.liveFolder(id);
    const [folders, items] = await Promise.all([
      this.prisma.vaultFolder.findMany({ where: { parentId: id, trashedAt: null }, select: { id: true } }),
      this.prisma.vaultItem.findMany({ where: { folderId: id, trashedAt: null, uploaded: true }, select: { id: true } }),
    ]);
    const same = (given: string[], existing: { id: string }[]) =>
      given.length === existing.length && new Set(given).size === given.length && existing.every((row) => given.includes(row.id));
    if (!same(input.folderIds, folders) || !same(input.itemIds, items)) {
      throw fieldError('ids', 'List everything in the folder exactly once');
    }
    await this.prisma.$transaction([
      ...input.folderIds.map((folderId, sortOrder) => this.prisma.vaultFolder.update({ where: { id: folderId }, data: { sortOrder } })),
      ...input.itemIds.map((itemId, sortOrder) =>
        this.prisma.vaultItem.update({ where: { id: itemId }, data: { sortOrder: input.folderIds.length + sortOrder } }),
      ),
    ]);
  }

  /** The front page: the top level, pins, and what was opened or added last. */
  async home(): Promise<{
    folders: FolderJson[];
    items: ItemJson[];
    pinned: { folders: FolderJson[]; items: ItemJson[] };
    recent: ItemJson[];
  }> {
    const map = await this.folderMap();
    const top = await this.open(null);
    const live = { trashedAt: null, uploaded: true } as const;
    const [pinnedFolders, pinnedItems, opened, added] = await Promise.all([
      this.prisma.vaultFolder.findMany({ where: { pinnedAt: { not: null }, trashedAt: null }, include: { values: true }, orderBy: { pinnedAt: 'asc' } }),
      this.prisma.vaultItem.findMany({ where: { pinnedAt: { not: null }, ...live }, include: ITEM_INCLUDE, orderBy: { pinnedAt: 'asc' } }),
      this.prisma.vaultItem.findMany({ where: { openedAt: { not: null }, ...live }, include: ITEM_INCLUDE, orderBy: { openedAt: 'desc' }, take: 10 }),
      this.prisma.vaultItem.findMany({ where: live, include: ITEM_INCLUDE, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    const touched = (row: ItemRow) => Math.max(row.openedAt?.getTime() ?? 0, row.createdAt.getTime());
    const recent = [...new Map([...opened, ...added].map((row) => [row.id, row])).values()]
      .sort((a, b) => touched(b) - touched(a))
      .slice(0, 10);
    return {
      folders: top.folders,
      items: top.items,
      pinned: {
        folders: pinnedFolders.map((row) => this.folderJson(row, map)),
        items: pinnedItems.map((row) => this.itemJson(row, map)),
      },
      recent: recent.map((row) => this.itemJson(row, map)),
    };
  }
}

const folderId = (id: string): string | null => (id === ROOT ? null : id);

const filterSchema = z.array(
  z.object({
    fieldId: z.string().min(1),
    op: z.enum(FILTER_OPS),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  }),
);

/** Reads ?filter=<json>&sort=&dir= from a folder address. */
export function listOptions(filter?: string, sort?: string, dir?: string): ListOptions {
  let filters: FieldFilter[] = [];
  if (filter) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(filter);
    } catch {
      throw fieldError('filter', 'That filter is not readable');
    }
    const result = filterSchema.safeParse(parsed);
    if (!result.success) throw fieldError('filter', 'That filter is not readable');
    filters = result.data;
  }
  if (sort !== undefined && sort !== 'name' && sort !== 'updated' && !sort.startsWith('field:')) {
    throw fieldError('sort', 'Sort by name, updated or a field');
  }
  return { filters, sort: sort as ListOptions['sort'], descending: dir === 'desc' };
}

@Controller('vault')
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get('home')
  home() {
    return this.folders.home();
  }

  @Get('folders/:id')
  open(@Param('id') id: string, @Query('filter') filter?: string, @Query('sort') sort?: string, @Query('dir') dir?: string) {
    return this.folders.open(folderId(id), listOptions(filter, sort, dir));
  }

  @Post('folders')
  createFolder(@Body(new ZodValidationPipe(createFolderSchema)) body: z.infer<typeof createFolderSchema>) {
    return this.folders.createFolder(body.parentId, body.name);
  }

  @Patch('folders/:id')
  updateFolder(@Param('id') id: string, @Body(new ZodValidationPipe(updateFolderSchema)) body: z.infer<typeof updateFolderSchema>) {
    if (id === ROOT) throw new BadRequestException('The top level cannot be changed');
    return this.folders.updateFolder(id, body);
  }

  @Post('folders/:id/reorder')
  @HttpCode(204)
  async reorder(@Param('id') id: string, @Body(new ZodValidationPipe(reorderSchema)) body: z.infer<typeof reorderSchema>) {
    await this.folders.reorder(folderId(id), body);
  }

  @Post('items')
  createItem(@Body(new ZodValidationPipe(createItemSchema)) body: z.infer<typeof createItemSchema>) {
    return this.folders.createItem(body);
  }

  @Get('items/:id')
  openItem(@Param('id') id: string) {
    return this.folders.openItem(id);
  }

  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body(new ZodValidationPipe(updateItemSchema)) body: z.infer<typeof updateItemSchema>) {
    return this.folders.updateItem(id, body);
  }

  @Post('move')
  @HttpCode(204)
  async move(@Body(new ZodValidationPipe(moveSchema)) body: z.infer<typeof moveSchema>) {
    await this.folders.move(body);
  }
}
