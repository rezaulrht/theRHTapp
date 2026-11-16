import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReminderEngineService } from '../src/reminders/reminder-engine.service';
import { FoldersService } from '../src/vault/folders';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

const dhaka = (date: string, time: string) => new Date(`${date}T${time}:00+06:00`);

interface Entry {
  date: string;
  kind: string;
  title: string;
  at: string | null;
  done: boolean;
  link: string;
}

describe('vault to-dos, reminders and calendar', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let folders: FoldersService;
  let engine: ReminderEngineService;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string) => http()[method](url).set('Cookie', cookie);
  const folder = async (name: string, parentId: string | null = null): Promise<string> =>
    (await call('post', '/api/vault/folders').send({ parentId, name })).body.id;
  const note = async (name: string, folderId: string | null): Promise<string> =>
    (await call('post', '/api/vault/items').send({ kind: 'note', folderId, name })).body.id;
  const calendar = async (from: string, to: string): Promise<Entry[]> =>
    (await call('get', `/api/vault/calendar?from=${from}&to=${to}`)).body;
  const todoReminders = () => prisma.reminder.findMany({ where: { ownerType: 'vault', ownerId: { startsWith: 'todo:' } } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    folders = app.get(FoldersService);
    engine = app.get(ReminderEngineService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    folders.clock = () => dhaka('2026-11-16', '10:00');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('to-dos', () => {
    it('adds, ticks, dates and removes to-dos, open ones first', async () => {
      const f = await folder('Physics');
      const a = (await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'Finish chapter 3' })).body;
      expect(a).toMatchObject({ text: 'Finish chapter 3', dueDate: null, done: false, remind: false });
      const b = (await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'Past papers', dueDate: '2026-11-20' })).body;

      expect((await call('patch', `/api/vault/todos/${a.id}`).send({ done: true })).body.done).toBe(true);
      const listing = (await call('get', `/api/vault/folders/${f}`)).body.todos;
      expect(listing.map((todo: { text: string; done: boolean }) => [todo.text, todo.done])).toEqual([
        ['Past papers', false],
        ['Finish chapter 3', true],
      ]);
      expect((await call('patch', `/api/vault/todos/${b.id}`).send({ dueDate: null })).body.dueDate).toBeNull();
      expect((await call('delete', `/api/vault/todos/${b.id}`)).status).toBe(204);
      expect((await call('post', `/api/vault/folders/${f}/todos`).send({ text: ' ' })).body.errors[0].path).toBe('text');
      expect((await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'X', dueDate: '2026-02-30' })).status).toBe(400);
    });

    it('a to-do with a reminder rings at 9 am on its day, and stops when done', async () => {
      const f = await folder('Physics');
      const todo = (await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'Submit lab report', dueDate: '2026-11-20', remind: true })).body;
      let reminders = await todoReminders();
      expect(reminders).toHaveLength(1);
      expect(reminders[0]).toMatchObject({ title: 'To do: Submit lab report', url: `/vault/f/${f}` });
      expect(reminders[0]!.nextFireAt).toEqual(dhaka('2026-11-20', '09:00'));

      await call('patch', `/api/vault/todos/${todo.id}`).send({ dueDate: '2026-11-21' });
      reminders = await todoReminders();
      expect(reminders.map((row) => row.nextFireAt)).toEqual([dhaka('2026-11-21', '09:00')]);

      await call('patch', `/api/vault/todos/${todo.id}`).send({ done: true });
      expect(await todoReminders()).toHaveLength(0);
    });

    it('no reminder for a day already past', async () => {
      const f = await folder('Physics');
      await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'Old', dueDate: '2026-11-15', remind: true });
      expect(await todoReminders()).toHaveLength(0);
    });
  });

  describe('reminders on folders and items', () => {
    it('adds, lists, changes and removes them, opening the right page', async () => {
      const f = await folder('Physics');
      const n = await note('Revision plan', f);
      const made = await call('post', '/api/vault/reminders').send({
        owner: `item:${n}`,
        title: 'Revise Newton',
        schedule: { kind: 'weekly', days: [5], time: '08:00' },
        channels: ['push', 'email'],
      });
      expect(made.status).toBe(201);
      // 20 November 2026 is the next Friday.
      expect(made.body).toMatchObject({ owner: `item:${n}`, next: dhaka('2026-11-20', '08:00').toISOString(), channels: ['push', 'email'] });
      expect((await prisma.reminder.findUniqueOrThrow({ where: { id: made.body.id } })).url).toBe(`/vault/i/${n}`);

      const listed = (await call('get', `/api/vault/reminders?owner=item:${n}`)).body;
      expect(listed.map((row: { title: string }) => row.title)).toEqual(['Revise Newton']);

      const changed = await call('patch', `/api/vault/reminders/${made.body.id}`).send({ title: 'Revise Kepler' });
      expect(changed.body.title).toBe('Revise Kepler');
      expect((await call('delete', `/api/vault/reminders/${made.body.id}`)).status).toBe(204);
      expect((await call('get', `/api/vault/reminders?owner=item:${n}`)).body).toEqual([]);

      const onFolder = await call('post', '/api/vault/reminders').send({
        owner: `folder:${f}`,
        title: 'Exam',
        schedule: { kind: 'once', at: dhaka('2026-12-01', '07:00').toISOString() },
        channels: ['push'],
      });
      expect((await prisma.reminder.findUniqueOrThrow({ where: { id: onFolder.body.id } })).url).toBe(`/vault/f/${f}`);
    });

    it('refuses a bad owner or schedule', async () => {
      expect((await call('post', '/api/vault/reminders').send({ owner: 'folder:nope', title: 'X', schedule: { kind: 'once', at: '2026-12-01T00:00:00Z' }, channels: [] })).status).toBe(404);
      expect((await call('post', '/api/vault/reminders').send({ owner: 'nonsense', title: 'X', schedule: { kind: 'once', at: '2026-12-01T00:00:00Z' }, channels: [] })).status).toBe(400);
      const f = await folder('F');
      const bad = await call('post', '/api/vault/reminders').send({ owner: `folder:${f}`, title: 'X', schedule: { kind: 'weekly', days: [], time: '08:00' }, channels: [] });
      expect(bad.status).toBe(400);
    });

    it('a reminder for something in the trash is not sent', async () => {
      const f = await folder('Physics');
      const made = (
        await call('post', '/api/vault/reminders').send({
          owner: `folder:${f}`,
          title: 'Revise',
          schedule: { kind: 'once', at: dhaka('2026-11-16', '11:00').toISOString() },
          channels: ['push'],
        })
      ).body;
      await call('delete', `/api/vault/folders/${f}`);
      await engine.tick(dhaka('2026-11-16', '11:00'));
      const deliveries = await prisma.reminderDelivery.findMany({ where: { reminderId: made.id } });
      expect(deliveries.map((row) => row.status)).toEqual(['skipped']);
    });
  });

  describe('calendar', () => {
    it('puts reminders, to-dos and date fields on their days', async () => {
      const f = await folder('Physics');
      const n = await note('Mock paper', f);
      await call('post', '/api/vault/reminders').send({
        owner: `folder:${f}`,
        title: 'Weekly revision',
        schedule: { kind: 'weekly', days: [1, 4], time: '19:00' },
        channels: ['push'],
      });
      await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'Lab report', dueDate: '2026-11-18' });
      const exam = (await call('post', '/api/vault/fields').send({ name: 'Exam date', type: 'date' })).body.id;
      await call('put', '/api/vault/values').send({ fieldId: exam, itemId: n, value: '2026-11-19' });

      const entries = await calendar('2026-11-16', '2026-11-22');
      expect(entries.map((entry) => [entry.date, entry.kind, entry.title])).toEqual([
        ['2026-11-16', 'reminder', 'Weekly revision'],
        ['2026-11-18', 'todo', 'Lab report'],
        ['2026-11-19', 'field', 'Exam date: Mock paper'],
        ['2026-11-19', 'reminder', 'Weekly revision'],
      ]);
      expect(entries[0]).toMatchObject({ at: dhaka('2026-11-16', '19:00').toISOString(), link: `/vault/f/${f}` });
      expect(entries[2]!.link).toBe(`/vault/i/${n}`);
    });

    it('leaves out what is in the trash, and limits the range', async () => {
      const f = await folder('Physics');
      await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'Lab report', dueDate: '2026-11-18' });
      await call('delete', `/api/vault/folders/${f}`);
      expect(await calendar('2026-11-16', '2026-11-22')).toEqual([]);
      expect((await call('get', '/api/vault/calendar?from=2026-11-01&to=2027-03-01')).status).toBe(400);
      expect((await call('get', '/api/vault/calendar?from=2026-11-20&to=2026-11-01')).status).toBe(400);
    });
  });

  it('the Today block shows pins and what is coming this week', async () => {
    const f = await folder('Physics');
    await call('patch', `/api/vault/folders/${f}`).send({ pinned: true });
    await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'Lab report', dueDate: '2026-11-18' });
    await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'Far away', dueDate: '2026-12-30' });
    const done = (await call('post', `/api/vault/folders/${f}/todos`).send({ text: 'Done already', dueDate: '2026-11-17' })).body;
    await call('patch', `/api/vault/todos/${done.id}`).send({ done: true });

    const today = (await call('get', '/api/vault/today')).body;
    expect(today.pinned.folders.map((entry: { name: string }) => entry.name)).toEqual(['Physics']);
    expect(today.upcoming.map((entry: Entry) => entry.title)).toEqual(['Lab report']);
  });

  it('the export holds the Vault, with file sizes as numbers', async () => {
    const f = await folder('Physics');
    await note('N', f);
    await prisma.vaultItem.create({ data: { kind: 'file', name: 'a.pdf', fileKey: 'vault/x', fileSize: BigInt(1234), mimeType: 'application/pdf' } });
    const body = (await call('get', '/api/export')).body;
    expect(body.vault.folders).toHaveLength(1);
    expect(body.vault.items).toHaveLength(2);
    expect(body.vault.items.find((item: { name: string }) => item.name === 'a.pdf').fileSize).toBe(1234);
  });
});
