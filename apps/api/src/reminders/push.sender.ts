import { Inject, Injectable } from '@nestjs/common';
import * as webPush from 'web-push';
import type { Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import type { ChannelSender, ReminderMessage } from './channel-sender';

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Sends one payload to one device. A failure carries the push service's HTTP
 * status as `statusCode`.
 */
export interface PushClient {
  send(target: PushTarget, payload: string): Promise<void>;
}

/** Injection token for the `PushClient`. */
export const WEB_PUSH = Symbol('WEB_PUSH');

/** The real client, backed by the `web-push` library and the server's VAPID keys. */
export function createWebPushClient(env: Env): PushClient {
  return {
    async send(target, payload) {
      if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
        throw new Error('Phone notifications are not set up on the server');
      }
      await webPush.sendNotification(target, payload, {
        vapidDetails: {
          subject: env.VAPID_SUBJECT,
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
        // Seconds the push service keeps trying if the phone is offline.
        TTL: 30 * 60,
      });
    },
  };
}

function statusCodeOf(error: unknown): number | undefined {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === 'number' ? code : undefined;
}

@Injectable()
export class PushSender implements ChannelSender {
  readonly channel = 'push' as const;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WEB_PUSH) private readonly client: PushClient,
  ) {}

  /** Sends to every subscribed device. Succeeds if at least one got it. */
  async send(message: ReminderMessage): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany();
    if (subscriptions.length === 0) throw new Error('No device is subscribed');

    const payload = JSON.stringify(message);
    let delivered = 0;
    let lastError = 'No device accepted the notification';
    for (const subscription of subscriptions) {
      try {
        await this.client.send(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
        );
        delivered++;
      } catch (error) {
        const status = statusCodeOf(error);
        if (status === 404 || status === 410) {
          // The phone has revoked this subscription; it will never work again.
          await this.prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
          lastError = 'The subscribed device is no longer registered';
        } else {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }
    }
    if (delivered === 0) throw new Error(lastError);
  }
}
