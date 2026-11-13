import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ENV, type Env } from '../env';
import { ReminderEngineService } from './reminder-engine.service';

/** Runs the reminder engine once a minute, and once at startup to catch up. */
@Injectable()
export class ReminderCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ReminderCronService.name);
  private running = false;

  constructor(
    private readonly engine: ReminderEngineService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    void this.run();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    // Tests drive the engine directly with fixed times.
    if (this.env.NODE_ENV === 'test' || this.running) return;
    this.running = true;
    try {
      await this.engine.tick(new Date());
    } catch (error) {
      this.logger.error(`Reminder run failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
