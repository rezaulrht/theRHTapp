import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CHANNEL_SENDERS } from './channel-sender';
import { ReminderCronService } from './reminder-cron.service';
import { ReminderEngineService } from './reminder-engine.service';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [
    ReminderEngineService,
    ReminderCronService,
    { provide: CHANNEL_SENDERS, useValue: [] },
  ],
  exports: [ReminderEngineService],
})
export class RemindersModule {}
