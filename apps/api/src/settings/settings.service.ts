import { BadRequestException, Injectable } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma } from '@pa/db';
import { defaultSettings, parseSettingsPatch, settingsSchema, type Settings } from '@pa/shared';
import { PrismaService } from '../prisma/prisma.service';

const KNOWN_KEYS = new Set(Object.keys(defaultSettings));

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every setting: what the owner has saved, laid over the defaults. */
  async getAll(): Promise<Settings> {
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
    return next;
  }
}
