import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { DaysController, DaysService } from './days';
import { HabitRemindersService } from './habit-reminders.service';
import { HabitsExportService } from './habits-export';
import { ItemsController, ItemsService } from './items';
import { ensureHabitSeed } from './seed';
import { StatsController, StatsService } from './stats';

@Module({
  controllers: [ItemsController, DaysController, StatsController],
  providers: [ItemsService, DaysService, StatsService, HabitsExportService, HabitRemindersService],
  exports: [ItemsService, DaysService],
})
export class HabitsModule implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    // Tests build their own routine and call the seed explicitly when they want it.
    if (this.env.NODE_ENV === 'test') return;
    await ensureHabitSeed(this.prisma);
  }
}
