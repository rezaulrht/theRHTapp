import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/**
 * A section's share of the data export. Money, Habits and Vault each register
 * one; its `key` becomes a property of the exported file.
 */
export interface ExportContributor {
  key: string;
  export(): Promise<unknown>;
}

/** Injection token for the list of contributors (`ExportContributor[]`). */
export const EXPORT_CONTRIBUTORS = Symbol('EXPORT_CONTRIBUTORS');

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(EXPORT_CONTRIBUTORS) initial: ExportContributor[],
  ) {
    this.contributors = [...initial];
  }

  private readonly contributors: ExportContributor[];

  /** Adds a section's data to the download. Called by that section's module at startup. */
  register(contributor: ExportContributor): void {
    this.contributors.push(contributor);
  }

  /** Everything the owner has entered. Never includes login or device secrets. */
  async build(now = new Date()): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      exportedAt: now.toISOString(),
      settings: await this.settings.getAll(),
      reminders: await this.prisma.reminder.findMany({ orderBy: { createdAt: 'asc' } }),
    };
    for (const contributor of this.contributors) {
      data[contributor.key] = await contributor.export();
    }
    return data;
  }
}
