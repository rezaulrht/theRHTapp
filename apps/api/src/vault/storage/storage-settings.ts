import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Put } from '@nestjs/common';
import type { Prisma } from '@pa/db';
import { z } from 'zod';
import { isSealed, seal, secretOf, unseal } from '../../ai/secret-box';
import { ENV, type Env } from '../../env';
import { PrismaService } from '../../prisma/prisma.service';
import { ZodValidationPipe } from '../../zod-validation.pipe';
import { type FileStorage, MissingStorage } from './file-storage';
import { LocalFileStorage } from './local-storage';
import { R2Storage, type R2Config } from './r2-storage';

/** The settings-table row holding the R2 keys. It is not one of the settings the app lists, so it never goes to the browser. */
const ROW = 'secret.r2';

export interface R2Status {
  configured: boolean;
  /** Where the storage in use gets its keys: saved in Settings, the server's environment, or nowhere. */
  source: 'settings' | 'env' | null;
  /** Shown so a saved setup can be recognised. Never a secret. */
  bucket: string | null;
  accessKeyEnd: string | null;
}

interface Stored {
  iv: string;
  tag: string;
  data: string;
  bucket: string;
  accessKeyEnd: string;
}

/** Keeps the R2 keys saved from Settings, encrypted. */
@Injectable()
export class R2ConfigService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async get(): Promise<(R2Config & { accessKeyEnd: string }) | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: ROW } });
    if (!row || !isSealed(row.value)) return null;
    const text = unseal(row.value, secretOf(this.env));
    if (!text) return null;
    try {
      const config = JSON.parse(text) as R2Config;
      return { ...config, accessKeyEnd: config.accessKeyId.slice(-4) };
    } catch {
      return null;
    }
  }

  async set(config: R2Config): Promise<void> {
    const sealed = seal(JSON.stringify(config), secretOf(this.env));
    const value = { ...sealed, bucket: config.bucket, accessKeyEnd: config.accessKeyId.slice(-4) } satisfies Stored as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({ where: { key: ROW }, create: { key: ROW, value }, update: { value } });
  }

  async remove(): Promise<void> {
    await this.prisma.setting.deleteMany({ where: { key: ROW } });
  }
}

/** R2 from the server's environment, files on disk in development, nothing in production. */
function fromEnvironment(env: Env, local: LocalFileStorage): { storage: FileStorage; fromEnv: boolean } {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
    return {
      fromEnv: true,
      storage: new R2Storage({
        accountId: env.R2_ACCOUNT_ID,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        bucket: env.R2_BUCKET,
      }),
    };
  }
  return { fromEnv: false, storage: env.NODE_ENV === 'production' ? new MissingStorage() : local };
}

/**
 * The Vault's file storage. It follows what is saved in Settings: keys saved
 * there win over the server's environment, and saving or removing them takes
 * effect straight away, with no restart.
 */
@Injectable()
export class DynamicStorage implements FileStorage {
  private current: FileStorage;
  private fromEnv: boolean;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly local: LocalFileStorage,
    private readonly configs: R2ConfigService,
  ) {
    ({ storage: this.current, fromEnv: this.fromEnv } = fromEnvironment(env, local));
  }

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** Reads the saved keys and switches to them, or back to the environment's choice. */
  async reload(): Promise<void> {
    const saved = await this.configs.get();
    if (saved) {
      this.current = new R2Storage(saved);
      this.fromEnv = false;
    } else {
      ({ storage: this.current, fromEnv: this.fromEnv } = fromEnvironment(this.env, this.local));
    }
  }

  async status(): Promise<R2Status> {
    const saved = await this.configs.get();
    if (saved) return { configured: true, source: 'settings', bucket: saved.bucket, accessKeyEnd: saved.accessKeyEnd };
    if (this.fromEnv) return { configured: true, source: 'env', bucket: this.env.R2_BUCKET ?? null, accessKeyEnd: null };
    return { configured: false, source: null, bucket: null, accessKeyEnd: null };
  }

  get ready(): boolean {
    return this.current.ready;
  }
  uploadUrl(key: string, mimeType: string, size: number) {
    return this.current.uploadUrl(key, mimeType, size);
  }
  downloadUrl(key: string, fileName: string, mimeType: string, inline: boolean) {
    return this.current.downloadUrl(key, fileName, mimeType, inline);
  }
  size(key: string) {
    return this.current.size(key);
  }
  read(key: string, maxBytes: number) {
    return this.current.read(key, maxBytes);
  }
  remove(key: string) {
    return this.current.remove(key);
  }
}

const text = (label: string) => z.string().trim().min(1, `Enter the ${label}`).max(200, `That ${label} is too long`);
const configSchema = z.object({
  accountId: text('account ID').regex(/^[A-Za-z0-9]+$/, 'The account ID is letters and numbers only'),
  accessKeyId: text('access key ID'),
  secretAccessKey: text('secret access key'),
  bucket: text('bucket name').regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'Use the bucket name exactly as in Cloudflare'),
});

@Controller('storage/r2')
export class StorageSettingsController {
  constructor(
    private readonly storage: DynamicStorage,
    private readonly configs: R2ConfigService,
  ) {}

  @Get()
  status(): Promise<R2Status> {
    return this.storage.status();
  }

  /** Tries the keys against the bucket first, and saves them only if they work. */
  @Put()
  @HttpCode(204)
  async save(@Body(new ZodValidationPipe(configSchema)) body: z.infer<typeof configSchema>): Promise<void> {
    try {
      await new R2Storage(body).check();
    } catch (error) {
      const name = (error as { name?: string }).name;
      const reason =
        name === 'NoSuchBucket'
          ? 'That bucket does not exist in this account.'
          : name === 'InvalidAccessKeyId' || name === 'SignatureDoesNotMatch'
            ? 'Cloudflare did not accept those keys.'
            : name === 'AccessDenied'
              ? 'Those keys cannot write to this bucket. Give the token Object Read and Write.'
              : 'Could not reach the bucket with those details.';
      throw new BadRequestException({ message: reason, errors: [] });
    }
    await this.configs.set(body);
    await this.storage.reload();
  }

  @Delete()
  @HttpCode(204)
  async remove(): Promise<void> {
    await this.configs.remove();
    await this.storage.reload();
  }
}
