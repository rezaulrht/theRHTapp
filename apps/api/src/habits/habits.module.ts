import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { ItemsController, ItemsService } from './items';
import { ensureHabitSeed } from './seed';

@Module({
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
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
