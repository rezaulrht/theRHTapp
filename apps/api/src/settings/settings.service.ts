import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@pa/db';
import { defaultSettings, parseSettingsPatch, settingsSchema, type Settings } from '@pa/shared';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';

const KNOWN_KEYS = new Set(Object.keys(defaultSettings));
const KEEP_MS = 60_000;
const COPY_KEY = 'settings';
const COPY_SECONDS = 3600;

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly listeners: ((changedKeys: string[]) => void | Promise<void>)[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Runs `listener` after settings are saved, with the keys that changed. */
  onChange(listener: (changedKeys: string[]) => void | Promise<void>): void {
    this.listeners.push(listener);
  }

  /**
   * Settings are read by nearly every request, and the database is far from the
   * server, so each read costs a long round trip. They change rarely and only
   * through `patch`, which clears this, so they are kept for a minute. The
   * minute only matters if the app ever runs on more than one server.
   * Tests empty the table behind the app's back, so nothing is kept there.
   */
  private kept: { value: Settings; at: number } | undefined;
  private readonly keep = process.env.NODE_ENV !== 'test';

  /** Every setting: what the owner has saved, laid over the defaults. */
  async getAll(): Promise<Settings> {
    if (this.keep && this.kept && Date.now() - this.kept.at < KEEP_MS) return structuredClone(this.kept.value);
    // Next the shared copy (in Redis, near the server), and only then the far-away database.
    const shared = await this.cache.getJson<unknown>(COPY_KEY);
    const checked = shared === null ? null : settingsSchema.safeParse(shared);
    const loaded = checked?.success ? checked.data : await this.load();
    if (!checked?.success) await this.cache.setJson(COPY_KEY, loaded, COPY_SECONDS);
    if (this.keep) this.kept = { value: structuredClone(loaded), at: Date.now() };
    return loaded;
  }

  private async load(): Promise<Settings> {
    const rows = await this.prisma.setting.findMany();
    const stored: Record<string, unknown> = {};
    for (const row of rows) {
      if (KNOWN_KEYS.has(row.key)) stored[row.key] = row.value;
    }
    const merged = settingsSchema.safeParse({ ...defaultSettings, ...stored });
    // Stored values were valid when saved. If the rules have since changed and
    // they no longer are, fall back to defaults rather than break every page.
    return merged.success ? merged.data : defaultSettings;
  }

  async get<K extends keyof Settings>(key: K): Promise<Settings[K]> {
    return (await this.getAll())[key];
  }

  /** Applies a partial change. All of it is saved or none of it. */
  async patch(patch: unknown): Promise<Settings> {
    const current = await this.getAll();
    const result = parseSettingsPatch(current, patch);
    if (!result.ok) {
      throw new BadRequestException({
        message: 'Some settings are not valid',
        errors: result.errors,
      });
    }

    const next = result.value;
    const changed = (Object.keys(next) as (keyof Settings)[]).filter(
      (key) => !isDeepStrictEqual(next[key], current[key]),
    );
    await this.prisma.$transaction(
      changed.map((key) => {
        const value = next[key] as Prisma.InputJsonValue;
        return this.prisma.setting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      }),
    );
    this.kept = undefined;
    await this.cache.del(COPY_KEY);
    if (changed.length > 0) {
      for (const listener of this.listeners) {
        try {
          await listener(changed);
        } catch (error) {
          // The settings are saved; a follow-up that fails must not report otherwise.
          this.logger.error(`Settings follow-up failed: ${String(error)}`);
        }
      }
    }
    return next;
  }
}
