import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { EXPORT_CONTRIBUTORS, type ExportContributor } from '../src/export/export.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { EMAIL_CLIENT, type EmailClient, type OutgoingEmail } from '../src/reminders/email.sender';
import { type PushClient, type PushTarget, WEB_PUSH } from '../src/reminders/push.sender';
import { ReminderEngineService } from '../src/reminders/reminder-engine.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

class FakePush implements PushClient {
  sent: { endpoint: string; payload: string }[] = [];
  /** endpoint -> HTTP status the push service answers with */
  failures = new Map<string, number>();
  async send(target: PushTarget, payload: string): Promise<void> {
    const status = this.failures.get(target.endpoint);
    if (status) throw Object.assign(new Error(`push service answered ${status}`), { statusCode: status });
    this.sent.push({ endpoint: target.endpoint, payload });
  }
}

class FakeEmail implements EmailClient {
  sent: OutgoingEmail[] = [];
  failWith: string | null = null;
  async send(email: OutgoingEmail): Promise<void> {
    if (this.failWith) throw new Error(this.failWith);
    this.sent.push(email);
  }
}

const sub = (n: number) => ({
  endpoint: `https://push.example.test/device-${n}`,
  keys: { p256dh: `p256dh-secret-${n}`, auth: `auth-secret-${n}` },
});

describe('delivery, test reminder and export', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const push = new FakePush();
  const email = new FakeEmail();
  // A made-up section, to show that whatever registers is included.
  const extra: ExportContributor = { key: 'vault', export: async () => [{ name: 'Lecture notes' }] };
  const http = () => request(app.getHttpServer());
  const authed = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    http()[method](url).set('Cookie', cookie);
  const sendTest = () => authed('post', '/api/reminders/test');
  const statusOf = (body: { deliveries: { channel: string; status: string; error: string | null }[] }, channel: string) =>
    body.deliveries.find((d) => d.channel === channel);

  beforeAll(async () => {
    process.env.VAPID_PUBLIC_KEY = 'test-public-key';
    process.env.WEB_ORIGIN = 'https://app.example.test';
    process.env.EMAIL_FROM = 'Personal <reminders@example.test>';
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(WEB_PUSH)
        .useValue(push)
        .overrideProvider(EMAIL_CLIENT)
        .useValue(email)
        .overrideProvider(EXPORT_CONTRIBUTORS)
        .useValue([extra]),
    );
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    push.sent = [];
    push.failures.clear();
    email.sent = [];
    email.failWith = null;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('push subscriptions', () => {
    it('returns the public key', async () => {
      const res = await authed('get', '/api/push/public-key');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: 'test-public-key' });
    });

    it('stores a subscription once per endpoint and updates its keys', async () => {
      expect((await authed('post', '/api/push/subscriptions').send(sub(1))).status).toBe(204);
      const again = { ...sub(1), keys: { p256dh: 'new-p256dh', auth: 'new-auth' } };
      expect((await authed('post', '/api/push/subscriptions').send(again)).status).toBe(204);
      const rows = await prisma.pushSubscription.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]!.p256dh).toBe('new-p256dh');
    });

    it('rejects a malformed subscription', async () => {
      const res = await authed('post', '/api/push/subscriptions').send({ endpoint: 'not a url' });
      expect(res.status).toBe(400);
    });

    it('removes a subscription', async () => {
      await authed('post', '/api/push/subscriptions').send(sub(1));
      const res = await authed('delete', '/api/push/subscriptions').send({ endpoint: sub(1).endpoint });
      expect(res.status).toBe(204);
      expect(await prisma.pushSubscription.count()).toBe(0);
    });

    it('needs a session', async () => {
      expect((await http().get('/api/push/public-key')).status).toBe(401);
      expect((await http().post('/api/push/subscriptions').send(sub(1))).status).toBe(401);
    });
  });

  describe('test reminder', () => {
    it('reports both channels as failed, with reasons, when nothing is set up', async () => {
      const res = await sendTest();
      expect(res.status).toBe(200);
      expect(statusOf(res.body, 'push')).toMatchObject({ status: 'failed', error: 'No device is subscribed' });
      expect(statusOf(res.body, 'email')).toMatchObject({ status: 'failed', error: 'No notification email is set' });
    });

    it('sends to every device and by email when both are set up', async () => {
      await authed('post', '/api/push/subscriptions').send(sub(1));
      await authed('post', '/api/push/subscriptions').send(sub(2));
      await authed('patch', '/api/settings').send({ 'general.notificationEmail': 'me@example.test' });

      const res = await sendTest();

      expect(statusOf(res.body, 'push')).toMatchObject({ status: 'sent', error: null });
      expect(statusOf(res.body, 'email')).toMatchObject({ status: 'sent', error: null });
      expect(push.sent.map((s) => s.endpoint).sort()).toEqual([sub(1).endpoint, sub(2).endpoint]);
      expect(JSON.parse(push.sent[0]!.payload)).toEqual({
        title: 'Test reminder',
        body: 'Reminders are working.',
        url: '/settings/notifications',
      });
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0]).toMatchObject({
        from: 'Personal <reminders@example.test>',
        to: 'me@example.test',
        subject: 'Test reminder',
      });
      expect(email.sent[0]!.text).toContain('Reminders are working.');
      expect(email.sent[0]!.text).toContain('https://app.example.test/settings/notifications');
    });

    it('ignores quiet hours', async () => {
      await authed('post', '/api/push/subscriptions').send(sub(1));
      await authed('patch', '/api/settings').send({
        'general.quietHours': { enabled: true, start: '00:00', end: '23:59' },
      });
      expect(statusOf((await sendTest()).body, 'push')).toMatchObject({ status: 'sent' });
    });

    it('drops a device the push service says is gone and still sends to the rest', async () => {
      for (const n of [1, 2, 3]) await authed('post', '/api/push/subscriptions').send(sub(n));
      push.failures.set(sub(2).endpoint, 410);

      const res = await sendTest();

      expect(statusOf(res.body, 'push')).toMatchObject({ status: 'sent' });
      expect(push.sent).toHaveLength(2);
      const left = await prisma.pushSubscription.findMany({ orderBy: { endpoint: 'asc' } });
      expect(left.map((s) => s.endpoint)).toEqual([sub(1).endpoint, sub(3).endpoint]);
    });

    it('also drops a device answering 404', async () => {
      await authed('post', '/api/push/subscriptions').send(sub(1));
      await authed('post', '/api/push/subscriptions').send(sub(2));
      push.failures.set(sub(1).endpoint, 404);
      await sendTest();
      expect(await prisma.pushSubscription.count()).toBe(1);
    });

    it('keeps a device after a temporary push failure and reports failed when none got through', async () => {
      await authed('post', '/api/push/subscriptions').send(sub(1));
      push.failures.set(sub(1).endpoint, 503);
      const res = await sendTest();
      expect(statusOf(res.body, 'push')!.status).toBe('failed');
      expect(await prisma.pushSubscription.count()).toBe(1);
    });

    it('reports failed when the only device is gone', async () => {
      await authed('post', '/api/push/subscriptions').send(sub(1));
      push.failures.set(sub(1).endpoint, 410);
      const res = await sendTest();
      expect(statusOf(res.body, 'push')!.status).toBe('failed');
      expect(await prisma.pushSubscription.count()).toBe(0);
    });

    it('still sends push when the mail service is down', async () => {
      await authed('post', '/api/push/subscriptions').send(sub(1));
      await authed('patch', '/api/settings').send({ 'general.notificationEmail': 'me@example.test' });
      email.failWith = 'Mail service is down';
      const res = await sendTest();
      expect(statusOf(res.body, 'push')).toMatchObject({ status: 'sent' });
      expect(statusOf(res.body, 'email')).toMatchObject({ status: 'failed', error: 'Mail service is down' });
    });
  });

  describe('delivery history', () => {
    it('lists the latest deliveries, newest first, with the reminder title', async () => {
      await sendTest();
      const engine = app.get(ReminderEngineService);
      const later = new Date(Date.now() + 60_000);
      await engine.create(
        { ownerType: 'system', title: 'Later one', body: '', url: '/today', channels: ['push'], schedule: { kind: 'once', at: later.toISOString() } },
        new Date(),
      );
      await engine.tick(later);

      const res = await authed('get', '/api/reminders/deliveries');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0]).toMatchObject({ title: 'Later one', channel: 'push', status: 'failed' });
      expect(res.body[1].title).toBe('Test reminder');
      expect(typeof res.body[0].occurrenceAt).toBe('string');
    });

    it('honours limit and caps it', async () => {
      await sendTest();
      expect((await authed('get', '/api/reminders/deliveries?limit=1')).body).toHaveLength(1);
      expect((await authed('get', '/api/reminders/deliveries?limit=99999')).status).toBe(200);
      expect((await authed('get', '/api/reminders/deliveries?limit=abc')).status).toBe(200);
    });
  });

  describe('export', () => {
    it('downloads settings, reminders and each contributor, and no secrets', async () => {
      await authed('post', '/api/push/subscriptions').send(sub(1));
      await authed('patch', '/api/settings').send({ 'general.timezone': 'Asia/Karachi' });
      await sendTest();

      const res = await authed('get', '/api/export');

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="personal-apps-\d{4}-\d{2}-\d{2}\.json"$/,
      );
      expect(res.body.settings['general.timezone']).toBe('Asia/Karachi');
      expect(res.body.reminders).toHaveLength(1);
      expect(res.body.reminders[0].title).toBe('Test reminder');
      expect(res.body.vault).toEqual([{ name: 'Lecture notes' }]);
      expect(typeof res.body.exportedAt).toBe('string');
      const text = JSON.stringify(res.body);
      for (const secret of ['passwordHash', 'tokenHash', 'p256dh', 'auth-secret-1', 'argon2']) {
        expect(text).not.toContain(secret);
      }
    });

    it('needs a session', async () => {
      expect((await http().get('/api/export')).status).toBe(401);
    });
  });
});
