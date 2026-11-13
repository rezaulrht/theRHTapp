import type { Channel } from '@pa/shared';

export interface ReminderMessage {
  title: string;
  body: string;
  /** Path inside the app to open when the reminder is tapped. */
  url: string;
}

/** Delivers a reminder one way (phone notification, email). Throws if it could not. */
export interface ChannelSender {
  readonly channel: Channel;
  send(message: ReminderMessage): Promise<void>;
}

/** Injection token for the list of available senders (`ChannelSender[]`). */
export const CHANNEL_SENDERS = Symbol('CHANNEL_SENDERS');
