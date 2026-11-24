import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { BudgetsController, BudgetsService } from './budgets';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';
import { LoansController, LoansService } from './loans';
import { MoneyExportController, MoneyExportService } from './money-export';
import { MoneyRemindersService } from './money-reminders.service';
import { ReportsController, ReportsService } from './reports';
import { ensureMoneySeed } from './seed';
import { ShortcutsController, ShortcutsService } from './shortcuts';

@Module({
  controllers: [
    AccountsController,
    CategoriesController,
    EntriesController,
    ShortcutsController,
    BudgetsController,
    LoansController,
    ReportsController,
    MoneyExportController,
  ],
  providers: [
    AccountsService,
    CategoriesService,
    EntriesService,
    ShortcutsService,
    BudgetsService,
    LoansService,
    ReportsService,
    MoneyRemindersService,
    MoneyExportService,
  ],
  exports: [AccountsService, CategoriesService, EntriesService, BudgetsService, LoansService, ReportsService],
})
export class MoneyModule implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    // Tests build their own data and call the seed explicitly when they want it.
    if (this.env.NODE_ENV === 'test') return;
    await ensureMoneySeed(this.prisma, await this.settings.get('general.timezone'));
  }
}
