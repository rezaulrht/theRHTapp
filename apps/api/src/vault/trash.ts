import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { FilesService } from './files';
import { FoldersService } from './folders';
import { FILE_STORAGE, type FileStorage } from './storage/file-storage';

export interface TrashEntry {
  id: string;
  kind: 'folder' | 'file' | 'note' | 'link';
  name: string;
  trashedAt: string;
  /** When it will be removed for good. */
  removeAt: string;
  /** For a folder: what went to the trash with it. */
  folders: number;
  items: number;
}

const DAY_MS = 86_400_000;

/**
 * Deleting moves things to the trash, together with everything inside them.
 * They can be restored until the trash period passes or the trash is emptied;
 * only then are rows and stored files removed for good.
 */
@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly folders: FoldersService,
    private readonly files: FilesService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async trashFolder(id: string): Promise<void> {
    await this.folders.liveFolder(id);
    const map = await this.folders.folderMap();
    // Things already in the trash keep their own place there.
    const inside = map.descendants(id).filter((folderId) => map.live(folderId));
    const folderIds = [id, ...inside];
    const mark = { trashedAt: this.folders.clock(), trashRootId: id };
    await this.prisma.$transaction([
      this.prisma.vaultFolder.updateMany({ where: { id: { in: folderIds } }, data: mark }),
      this.prisma.vaultItem.updateMany({ where: { folderId: { in: folderIds }, trashedAt: null }, data: mark }),
    ]);
  }

  async trashItem(id: string): Promise<void> {
    const row = await this.prisma.vaultItem.findUnique({ where: { id } });
    if (!row || row.trashedAt) throw new NotFoundException('That item does not exist');
    await this.prisma.vaultItem.update({ where: { id }, data: { trashedAt: this.folders.clock(), trashRootId: id } });
  }

  async list(): Promise<TrashEntry[]> {
    const days = await this.settings.get('vault.trashDays');
    const [folders, items] = await Promise.all([
      this.prisma.vaultFolder.findMany({ where: { trashedAt: { not: null } } }),
      this.prisma.vaultItem.findMany({ where: { trashedAt: { not: null } } }),
    ]);
    const entries: TrashEntry[] = [];
    const removeAt = (at: Date) => new Date(at.getTime() + days * DAY_MS).toISOString();
    for (const folder of folders.filter((row) => row.trashRootId === row.id)) {
      entries.push({
        id: folder.id,
        kind: 'folder',
        name: folder.name,
        trashedAt: folder.trashedAt!.toISOString(),
        removeAt: removeAt(folder.trashedAt!),
        folders: folders.filter((row) => row.trashRootId === folder.id && row.id !== folder.id).length,
        items: items.filter((row) => row.trashRootId === folder.id).length,
      });
    }
    for (const item of items.filter((row) => row.trashRootId === row.id && row.uploaded)) {
      entries.push({
        id: item.id,
        kind: item.kind as TrashEntry['kind'],
        name: item.name,
        trashedAt: item.trashedAt!.toISOString(),
        removeAt: removeAt(item.trashedAt!),
        folders: 0,
        items: 0,
      });
    }
    return entries.sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
  }

  /**
   * Brings back what was deleted together. If the folder it was in is itself
   * in the trash or gone, it comes back at the top level instead.
   */
  async restore(rootId: string): Promise<void> {
    const [folder, item] = await Promise.all([
      this.prisma.vaultFolder.findFirst({ where: { id: rootId, trashRootId: rootId } }),
      this.prisma.vaultItem.findFirst({ where: { id: rootId, trashRootId: rootId } }),
    ]);
    if (!folder && !item) throw new NotFoundException('That is not in the trash');
    const map = await this.folders.folderMap();
    const home = folder ? folder.parentId : item!.folderId;
    const stays = home !== null && map.live(home);
    const clear = { trashedAt: null, trashRootId: null };

    await this.prisma.$transaction([
      this.prisma.vaultFolder.updateMany({ where: { trashRootId: rootId }, data: clear }),
      this.prisma.vaultItem.updateMany({ where: { trashRootId: rootId }, data: clear }),
      ...(stays
        ? []
        : folder
          ? [this.prisma.vaultFolder.updateMany({ where: { id: rootId }, data: { parentId: null } })]
          : [this.prisma.vaultItem.updateMany({ where: { id: rootId }, data: { folderId: null } })]),
    ]);
  }

  /** Removes one deleted thing and everything that went with it, stored files first. */
  private async purge(rootId: string): Promise<boolean> {
    const [folders, items] = await Promise.all([
      this.prisma.vaultFolder.findMany({ where: { trashRootId: rootId } }),
      this.prisma.vaultItem.findMany({ where: { trashRootId: rootId } }),
    ]);
    let complete = true;
    const gone: string[] = [];
    for (const item of items) {
      try {
        if (item.fileKey) await this.storage.remove(item.fileKey);
        gone.push(item.id);
      } catch (error) {
        // The row stays, so the file is tried again next time rather than lost track of.
        complete = false;
        this.logger.error(`Could not remove the stored file of ${item.id}: ${String(error)}`);
      }
    }
    const owners = [...gone.map((id) => `item:${id}`), ...folders.map((row) => `folder:${row.id}`)];
    await this.prisma.$transaction([
      this.prisma.vaultItem.deleteMany({ where: { id: { in: gone } } }),
      this.prisma.reminder.deleteMany({ where: { ownerType: 'vault', ownerId: { in: owners } } }),
    ]);
    // To-dos and their reminders go with their folder.
    const todos = await this.prisma.vaultTodo.findMany({ where: { folderId: { in: folders.map((row) => row.id) } }, select: { id: true } });
    await this.prisma.reminder.deleteMany({ where: { ownerType: 'vault', ownerId: { in: todos.map((row) => `todo:${row.id}`) } } });

    // Deepest folders first; one still holding something (a file that could not be removed) stays.
    const depth = (id: string) => {
      let count = 0;
      for (let current = folders.find((row) => row.id === id)?.parentId ?? null; current; ) {
        count += 1;
        current = folders.find((row) => row.id === current)?.parentId ?? null;
      }
      return count;
    };
    for (const folder of [...folders].sort((a, b) => depth(b.id) - depth(a.id))) {
      const [children, contents] = await Promise.all([
        this.prisma.vaultFolder.count({ where: { parentId: folder.id } }),
        this.prisma.vaultItem.count({ where: { folderId: folder.id } }),
      ]);
      if (children === 0 && contents === 0) await this.prisma.vaultFolder.delete({ where: { id: folder.id } });
      else complete = false;
    }
    return complete;
  }

  private async roots(where: { trashedAt: { not: null } | { lt: Date } }): Promise<string[]> {
    const [folders, items] = await Promise.all([
      this.prisma.vaultFolder.findMany({ where, select: { trashRootId: true } }),
      this.prisma.vaultItem.findMany({ where, select: { trashRootId: true } }),
    ]);
    return [...new Set([...folders, ...items].map((row) => row.trashRootId).filter((id): id is string => id !== null))];
  }

  /** Empties the trash now. Answers how many deleted things could not be fully removed. */
  async empty(): Promise<{ left: number }> {
    let left = 0;
    for (const root of await this.roots({ trashedAt: { not: null } })) {
      if (!(await this.purge(root))) left += 1;
    }
    return { left };
  }

  /** Removes what has been in the trash longer than the trash period. */
  async purgeExpired(now: Date): Promise<void> {
    const days = await this.settings.get('vault.trashDays');
    const cutoff = new Date(now.getTime() - days * DAY_MS);
    for (const root of await this.roots({ trashedAt: { lt: cutoff } })) await this.purge(root);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async hourly(): Promise<void> {
    // Tests call the steps directly with fixed times.
    if (this.env.NODE_ENV === 'test' || this.running) return;
    this.running = true;
    try {
      const now = new Date();
      await this.purgeExpired(now);
      await this.files.cleanUnfinished(now);
    } catch (error) {
      this.logger.error(`Vault clean-up failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}

@Controller('vault')
export class TrashController {
  constructor(private readonly trash: TrashService) {}

  @Delete('folders/:id')
  @HttpCode(204)
  async trashFolder(@Param('id') id: string) {
    await this.trash.trashFolder(id);
  }

  @Delete('items/:id')
  @HttpCode(204)
  async trashItem(@Param('id') id: string) {
    await this.trash.trashItem(id);
  }

  @Get('trash')
  list() {
    return this.trash.list();
  }

  @Post('trash/:id/restore')
  @HttpCode(204)
  async restore(@Param('id') id: string) {
    await this.trash.restore(id);
  }

  @Delete('trash')
  empty() {
    return this.trash.empty();
  }
}
