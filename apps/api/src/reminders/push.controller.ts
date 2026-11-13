import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { z } from 'zod';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../zod-validation.pipe';

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().min(1) });

/** Registers the owner's devices for phone notifications. */
@Controller('push')
export class PushController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('public-key')
  publicKey(): { key: string } {
    if (!this.env.VAPID_PUBLIC_KEY) {
      throw new ServiceUnavailableException('Phone notifications are not set up on the server');
    }
    return { key: this.env.VAPID_PUBLIC_KEY };
  }

  @Post('subscriptions')
  @HttpCode(204)
  async subscribe(
    @Body(new ZodValidationPipe(subscriptionSchema)) body: z.infer<typeof subscriptionSchema>,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    const data = { p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent: userAgent ?? null };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { endpoint: body.endpoint, ...data },
      update: data,
    });
  }

  @Delete('subscriptions')
  @HttpCode(204)
  async unsubscribe(
    @Body(new ZodValidationPipe(unsubscribeSchema)) body: z.infer<typeof unsubscribeSchema>,
  ): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } });
  }
}
