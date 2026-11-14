import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { EntriesController } from './entries.controller';
import { EntriesService } from './entries.service';
import { ensureMoneySeed } from './seed';

@Module({
  controllers: [AccountsController, CategoriesController, EntriesController],
  providers: [AccountsService, CategoriesService, EntriesService],
  exports: [AccountsService, CategoriesService, EntriesService],
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
