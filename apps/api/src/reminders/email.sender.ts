import { Inject, Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { ENV, type Env } from '../env';
import { SettingsService } from '../settings/settings.service';
import type { ChannelSender, ReminderMessage } from './channel-sender';

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface EmailClient {
  send(email: OutgoingEmail): Promise<void>;
}

/** Injection token for the `EmailClient`. */
export const EMAIL_CLIENT = Symbol('EMAIL_CLIENT');

/** The real client, backed by Resend. */
export function createResendClient(env: Env): EmailClient {
  let resend: Resend | undefined;
  return {
    async send(email) {
      if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
        throw new Error('Email is not set up on the server');
      }
      resend ??= new Resend(env.RESEND_API_KEY);
      const { error } = await resend.emails.send(email);
      if (error) throw new Error(error.message);
    },
  };
}

@Injectable()
export class EmailSender implements ChannelSender {
  readonly channel = 'email' as const;

  constructor(
    private readonly settings: SettingsService,
    @Inject(EMAIL_CLIENT) private readonly client: EmailClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async send(message: ReminderMessage): Promise<void> {
    const to = await this.settings.get('general.notificationEmail');
    if (!to) throw new Error('No notification email is set');

    const link = `${this.env.WEB_ORIGIN ?? ''}${message.url}`;
    const text = [message.body, link].filter(Boolean).join('\n\n');
    await this.client.send({
      from: this.env.EMAIL_FROM ?? '',
      to,
      subject: message.title,
      text,
    });
  }
}
