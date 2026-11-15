import { Injectable, type OnModuleInit } from '@nestjs/common';
import { type ExportContributor, ExportService } from '../export/export.service';
import { PrismaService } from '../prisma/prisma.service';

/** Habits' share of the data export: the routine, every day, and every tick. */
@Injectable()
export class HabitsExportService implements OnModuleInit, ExportContributor {
  readonly key = 'habits';

  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ExportService,
  ) {}

  onModuleInit(): void {
    this.exporter.register(this);
  }

  async export(): Promise<unknown> {
    const [items, days, dayItems, marks] = await Promise.all([
      this.prisma.habitItem.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.habitDay.findMany({ orderBy: { day: 'asc' } }),
      this.prisma.habitDayItem.findMany({ orderBy: [{ day: 'asc' }, { sortOrder: 'asc' }] }),
      this.prisma.habitMark.findMany({ orderBy: { at: 'asc' } }),
    ]);
    return { items, days, dayItems, marks };
  }
}
