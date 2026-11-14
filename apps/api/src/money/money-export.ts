import { Controller, Get, Header, Injectable, type OnModuleInit, Res } from '@nestjs/common';
import { todayIn } from '@pa/shared';
import type { Response } from 'express';
import { type ExportContributor, ExportService } from '../export/export.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { fromDbDate } from './common';

const CSV_HEADER = ['date', 'kind', 'name', 'amount', 'account', 'to_account', 'category', 'person', 'note'];

/**
 * One CSV field. A value that starts with = + - or @ would be run as a
 * formula when the file is opened in a spreadsheet, so it gets a leading
 * quote mark, which spreadsheets show as plain text.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Money's part of the data download, and the entries as a spreadsheet file. */
@Injectable()
export class MoneyExportService implements OnModuleInit, ExportContributor {
  readonly key = 'money';

  constructor(
    private readonly prisma: PrismaService,
    private readonly exporter: ExportService,
  ) {}

  onModuleInit(): void {
    this.exporter.register(this);
  }

  async export(): Promise<unknown> {
    const [accounts, categories, people, entries, shortcuts, budgets] = await Promise.all([
      this.prisma.moneyAccount.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.moneyCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.moneyPerson.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.moneyEntry.findMany({ orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.moneyShortcut.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.prisma.moneyBudget.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    return { accounts, categories, people, entries, shortcuts, budgets };
  }

  /** Every entry, oldest first, with names in place of ids and amounts in taka. */
  async csv(): Promise<string> {
    const entries = await this.prisma.moneyEntry.findMany({
      include: { account: true, toAccount: true, category: true, person: true },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const rows = entries.map((entry) => [
      fromDbDate(entry.date),
      entry.kind,
      entry.name,
      (entry.amount / 100).toFixed(2),
      entry.account.name,
      entry.toAccount?.name ?? '',
      entry.category?.name ?? '',
      entry.person?.name ?? '',
      entry.note ?? '',
    ]);
    return [CSV_HEADER, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
  }
}

@Controller('export')
export class MoneyExportController {
  constructor(
    private readonly money: MoneyExportService,
    private readonly settings: SettingsService,
  ) {}

  @Get('money.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async download(@Res({ passthrough: true }) res: Response): Promise<string> {
    const date = todayIn(await this.settings.get('general.timezone'));
    res.setHeader('Content-Disposition', `attachment; filename="money-${date}.csv"`);
    return this.money.csv();
  }
}
