import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { fieldError } from '../money/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { FoldersService, ITEM_INCLUDE, type ItemJson, type ItemRow, vaultNameSchema } from './folders';
import { FILE_STORAGE, type FileStorage } from './storage/file-storage';

/** The R2 free allowance the owner is working within. */
export const STORAGE_ALLOWANCE = 10 * 1024 ** 3;
/** The most of a text file shown in the app; bigger ones download. */
export const MAX_TEXT_BYTES = 2 * 1024 ** 2;
/** An upload not finished in this long is given up on. */
export const UNFINISHED_AFTER_MS = 24 * 3_600_000;

const NOT_SET_UP = 'File storage is not set up yet';

const startSchema = z.object({
  folderId: z.string().min(1).nullable(),
  name: vaultNameSchema,
  size: z.number('Give the file size').int().min(0, 'Give the file size'),
  mimeType: z.string().trim().max(200).default(''),
});

/** Files that are read as text in the app. */
export function isText(name: string, mimeType: string): boolean {
  return /^text\/(plain|markdown|x-markdown)$/.test(mimeType) || /\.(md|markdown|txt)$/i.test(name);
}

const megabytes = (bytes: number) => bytes / 1024 ** 2;

/** Uploading, opening and counting Vault files. The bytes go straight between the browser and storage. */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly folders: FoldersService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  private async limitBytes(): Promise<{ bytes: number; mb: number }> {
    const mb = await this.settings.get('vault.maxFileMb');
    return { bytes: mb * 1024 ** 2, mb };
  }

  private async fileItem(id: string, uploaded: boolean | null = true): Promise<ItemRow> {
    const row = await this.prisma.vaultItem.findUnique({ where: { id }, include: ITEM_INCLUDE });
    if (!row || row.kind !== 'file' || row.trashedAt || !row.fileKey) throw new NotFoundException('That file does not exist');
    if (uploaded !== null && row.uploaded !== uploaded) throw new NotFoundException('That file does not exist');
    return row;
  }

  /** Makes a waiting item and a signed address to send the file to. */
  async start(input: z.infer<typeof startSchema>): Promise<{ item: ItemJson; upload: { url: string; headers: Record<string, string> } }> {
    if (!this.storage.ready) throw new BadRequestException(NOT_SET_UP);
    const limit = await this.limitBytes();
    if (input.size > limit.bytes) throw fieldError('size', `Files can be up to ${limit.mb} MB`);
    const folderId = await this.folders.checkParent(input.folderId, 'folderId');
    const mimeType = input.mimeType || 'application/octet-stream';
    const key = `vault/${randomUUID()}`;

    const last = await this.prisma.vaultItem.aggregate({ where: { folderId }, _max: { sortOrder: true } });
    const lastFolder = await this.prisma.vaultFolder.aggregate({ where: { parentId: folderId }, _max: { sortOrder: true } });
    const row = await this.prisma.vaultItem.create({
      data: {
        folderId,
        kind: 'file',
        name: input.name,
        fileKey: key,
        fileSize: BigInt(input.size),
        mimeType,
        uploaded: false,
        sortOrder: Math.max(last._max.sortOrder ?? -1, lastFolder._max.sortOrder ?? -1) + 1,
        createdAt: this.folders.clock(),
      },
      include: ITEM_INCLUDE,
    });
    const upload = await this.storage.uploadUrl(key, mimeType, input.size);
    return { item: this.folders.itemJson(row, await this.folders.folderMap()), upload };
  }

  /** Confirms a file arrived and is within the limit; only then does it appear in the Vault. */
  async complete(id: string): Promise<ItemJson> {
    const row = await this.fileItem(id, null);
    if (row.uploaded) return this.folders.itemJson(row, await this.folders.folderMap());
    const stored = await this.storage.size(row.fileKey!);
    if (stored === null) throw new BadRequestException('The file did not arrive. Try the upload again.');

    const limit = await this.limitBytes();
    if (stored > limit.bytes) {
      await this.storage.remove(row.fileKey!);
      await this.prisma.vaultItem.delete({ where: { id } });
      throw fieldError('size', `Files can be up to ${limit.mb} MB`);
    }
    const done = await this.prisma.vaultItem.update({
      where: { id },
      data: { uploaded: true, fileSize: BigInt(stored) },
      include: ITEM_INCLUDE,
    });
    return this.folders.itemJson(done, await this.folders.folderMap());
  }

  async url(id: string, inline: boolean): Promise<{ url: string }> {
    const row = await this.fileItem(id);
    if (!this.storage.ready) throw new BadRequestException(NOT_SET_UP);
    return { url: await this.storage.downloadUrl(row.fileKey!, row.name, row.mimeType ?? 'application/octet-stream', inline) };
  }

  /** A markdown or plain text file's words, to show in the app. */
  async text(id: string): Promise<{ text: string }> {
    const row = await this.fileItem(id);
    if (!isText(row.name, row.mimeType ?? '')) throw new BadRequestException('Only text and markdown files can be shown here');
    if (Number(row.fileSize ?? 0) > MAX_TEXT_BYTES) {
      throw new BadRequestException(`This file is over ${megabytes(MAX_TEXT_BYTES)} MB. Download it to read it.`);
    }
    const bytes = await this.storage.read(row.fileKey!, MAX_TEXT_BYTES);
    return { text: bytes.toString('utf8') };
  }

  /** Space used by every finished file, those in the trash included. */
  async usage(): Promise<{ used: number; allowance: number; files: number }> {
    const totals = await this.prisma.vaultItem.aggregate({
      where: { kind: 'file', uploaded: true },
      _sum: { fileSize: true },
      _count: true,
    });
    return { used: Number(totals._sum.fileSize ?? 0), allowance: STORAGE_ALLOWANCE, files: totals._count };
  }

  /** Removes uploads that were started a day ago and never finished. */
  async cleanUnfinished(now: Date): Promise<number> {
    const stale = await this.prisma.vaultItem.findMany({
      where: { kind: 'file', uploaded: false, createdAt: { lt: new Date(now.getTime() - UNFINISHED_AFTER_MS) } },
    });
    let removed = 0;
    for (const row of stale) {
      try {
        if (row.fileKey) await this.storage.remove(row.fileKey);
        await this.prisma.vaultItem.delete({ where: { id: row.id } });
        removed += 1;
      } catch (error) {
        // Kept for the next run rather than leaving a stored file with no row.
        this.logger.error(`Could not clear unfinished upload ${row.id}: ${String(error)}`);
      }
    }
    return removed;
  }
}

@Controller('vault')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('files')
  start(@Body(new ZodValidationPipe(startSchema)) body: z.infer<typeof startSchema>) {
    return this.files.start(body);
  }

  @Post('files/:id/complete')
  complete(@Param('id') id: string) {
    return this.files.complete(id);
  }

  @Get('files/:id/url')
  url(@Param('id') id: string, @Query('inline') inline?: string) {
    return this.files.url(id, inline === '1' || inline === 'true');
  }

  @Get('files/:id/text')
  text(@Param('id') id: string) {
    return this.files.text(id);
  }

  @Get('storage')
  usage() {
    return this.files.usage();
  }
}
