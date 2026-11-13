import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ENV, type Env } from '../env';
import { CHANNEL_SENDERS } from './channel-sender';
import { createResendClient, EMAIL_CLIENT, EmailSender } from './email.sender';
import { PushController } from './push.controller';
import { createWebPushClient, PushSender, WEB_PUSH } from './push.sender';
import { ReminderCronService } from './reminder-cron.service';
import { ReminderEngineService } from './reminder-engine.service';
import { RemindersController } from './reminders.controller';

@Global()
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [PushController, RemindersController],
  providers: [
    ReminderEngineService,
    ReminderCronService,
    PushSender,
    EmailSender,
    { provide: WEB_PUSH, useFactory: (env: Env) => createWebPushClient(env), inject: [ENV] },
    { provide: EMAIL_CLIENT, useFactory: (env: Env) => createResendClient(env), inject: [ENV] },
    {
      provide: CHANNEL_SENDERS,
      useFactory: (push: PushSender, email: EmailSender) => [push, email],
      inject: [PushSender, EmailSender],
    },
  ],
  exports: [ReminderEngineService],
})
export class RemindersModule {}
