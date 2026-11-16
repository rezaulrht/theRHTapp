import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

interface Named {
  id: string;
  name: string;
}

describe('vault tags, fields and search', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string) => http()[method](url).set('Cookie', cookie);
  const folder = async (name: string, parentId: string | null = null): Promise<string> =>
    (await call('post', '/api/vault/folders').send({ parentId, name })).body.id;
  const note = async (name: string, folderId: string | null, body = ''): Promise<string> =>
    (await call('post', '/api/vault/items').send({ kind: 'note', folderId, name, body })).body.id;
  const tag = async (name: string): Promise<string> => (await call('post', '/api/vault/tags').send({ name })).body.id;
  const field = async (name: string, type: string, choices: string[] = []): Promise<string> =>
    (await call('post', '/api/vault/fields').send({ name, type, choices })).body.id;
  const setValue = (body: object) => call('put', '/api/vault/values').send(body);
  const names = (list: Named[]) => list.map((entry) => entry.name);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('tags', () => {
    it('tag items in different folders and lists them together', async () => {
      const chapter = await folder('Chapter 3');
      const revision = await folder('Revision');
      const a = await note('Newton', chapter);
      const b = await note('Kepler', revision);
      const exam = await tag('Exam revision');

      await call('put', `/api/vault/items/${a}/tags`).send({ tagIds: [exam] });
      const tagged = await call('put', `/api/vault/items/${b}/tags`).send({ tagIds: [exam, exam] });
      expect(tagged.body.tagIds).toEqual([exam]);

      const page = (await call('get', `/api/vault/tags/${exam}/items`)).body;
      expect(page.tag).toMatchObject({ name: 'Exam revision', count: 2 });
      expect(names(page.items).sort()).toEqual(['Kepler', 'Newton']);
      expect(page.items.find((item: Named) => item.name === 'Newton').path.map((step: Named) => step.name)).toEqual(['Chapter 3']);
    });

    it('refuses a duplicate name and an unknown tag', async () => {
      await tag('Exam');
      const again = await call('post', '/api/vault/tags').send({ name: 'Exam' });
      expect(again.status).toBe(400);
      expect(again.body.errors[0].path).toBe('name');
      const n = await note('N', null);
      expect((await call('put', `/api/vault/items/${n}/tags`).send({ tagIds: ['nope'] })).status).toBe(400);
    });

    it('renames, recolours and deletes a tag, taking it off items', async () => {
      const id = await tag('Exam');
      const n = await note('N', null);
      await call('put', `/api/vault/items/${n}/tags`).send({ tagIds: [id] });
      expect((await call('patch', `/api/vault/tags/${id}`).send({ name: 'Finals', color: 'coral' })).body).toMatchObject({
        name: 'Finals',
        color: 'coral',
        count: 1,
      });
      expect((await call('delete', `/api/vault/tags/${id}`)).status).toBe(204);
      expect((await call('get', `/api/vault/items/${n}`)).body.tagIds).toEqual([]);
      expect((await call('get', '/api/vault/tags')).body).toEqual([]);
    });
  });

  describe('fields', () => {
    it('defines a field of each type and checks each value', async () => {
      const n = await note('N', null);
      const cases: [string, string[], unknown, unknown][] = [
        ['text', [], 'রহিম স্যার', '   '],
        ['number', [], 3, 'three'],
        ['date', [], '2026-12-01', '2026-02-30'],
        ['choice', ['Claude', 'ChatGPT'], 'Claude', 'Gemini'],
        ['url', [], 'https://claude.ai/chat/1', 'claude.ai'],
        ['boolean', [], true, 'yes'],
      ];
      for (const [type, choices, good, bad] of cases) {
        const id = await field(`A ${type}`, type, choices);
        expect((await setValue({ fieldId: id, itemId: n, value: good })).body).toEqual({ fieldId: id, value: good });
        const refused = await setValue({ fieldId: id, itemId: n, value: bad });
        expect(refused.status).toBe(400);
        expect(refused.body.errors[0].path).toBe('value');
      }
      const values = (await call('get', `/api/vault/items/${n}`)).body.values;
      expect(Object.values(values)).toEqual(['রহিম স্যার', 3, '2026-12-01', 'Claude', 'https://claude.ai/chat/1', true]);
    });

    it('a choice field needs choices, and its type cannot be changed', async () => {
      const none = await call('post', '/api/vault/fields').send({ name: 'Source', type: 'choice', choices: [] });
      expect(none.body.errors[0].path).toBe('choices');
      const id = await field('Source', 'choice', ['Claude']);
      const changed = await call('patch', `/api/vault/fields/${id}`).send({ type: 'text' });
      expect(changed.status).toBe(400);
      expect(changed.body.errors[0].path).toBe('type');
      expect((await call('patch', `/api/vault/fields/${id}`).send({ choices: ['Claude', 'ChatGPT'] })).body.choices).toEqual([
        'Claude',
        'ChatGPT',
      ]);
    });

    it('clears a value with null, and gives values to folders too', async () => {
      const f = await folder('Physics');
      const teacher = await field('Teacher', 'text');
      await setValue({ fieldId: teacher, folderId: f, value: 'Mr Karim' });
      expect((await call('get', `/api/vault/folders/${f}`)).body.folder.values).toEqual({ [teacher]: 'Mr Karim' });
      await setValue({ fieldId: teacher, folderId: f, value: null });
      expect((await call('get', `/api/vault/folders/${f}`)).body.folder.values).toEqual({});
    });

    it('archiving a field keeps its values but takes no new ones', async () => {
      const n = await note('N', null);
      const id = await field('Teacher', 'text');
      await setValue({ fieldId: id, itemId: n, value: 'Mr Karim' });
      await call('patch', `/api/vault/fields/${id}`).send({ archived: true });
      expect((await call('get', '/api/vault/fields')).body[0]).toMatchObject({ archived: true });
      expect((await call('get', `/api/vault/items/${n}`)).body.values[id]).toBe('Mr Karim');
      expect((await setValue({ fieldId: id, itemId: n, value: 'Ms Rina' })).status).toBe(400);
    });

    it('reorders fields', async () => {
      const a = await field('A', 'text');
      const b = await field('B', 'text');
      expect((await call('post', '/api/vault/fields/reorder').send({ ids: [b] })).status).toBe(400);
      await call('post', '/api/vault/fields/reorder').send({ ids: [b, a] });
      expect(names((await call('get', '/api/vault/fields')).body)).toEqual(['B', 'A']);
    });

    it('filters and sorts a folder by field values', async () => {
      const chapter = await folder('Chapter 3');
      const number = await field('Part', 'number');
      const source = await field('Source', 'choice', ['Claude', 'ChatGPT']);
      const ids = {
        a: await note('Part ten', chapter),
        b: await note('Part two', chapter),
        c: await note('No part', chapter),
      };
      await setValue({ fieldId: number, itemId: ids.a, value: 10 });
      await setValue({ fieldId: number, itemId: ids.b, value: 2 });
      await setValue({ fieldId: source, itemId: ids.a, value: 'Claude' });
      await setValue({ fieldId: source, itemId: ids.c, value: 'ChatGPT' });

      const list = async (query: string) => names((await call('get', `/api/vault/folders/${chapter}?${query}`)).body.items);
      expect(await list(`sort=field:${number}`)).toEqual(['Part two', 'Part ten', 'No part']);
      expect(await list(`sort=field:${number}&dir=desc`)).toEqual(['Part ten', 'Part two', 'No part']);
      expect(await list('sort=name')).toEqual(['No part', 'Part ten', 'Part two']);
      const filter = encodeURIComponent(JSON.stringify([{ fieldId: source, op: 'eq', value: 'Claude' }]));
      expect(await list(`filter=${filter}`)).toEqual(['Part ten']);
      const set = encodeURIComponent(JSON.stringify([{ fieldId: number, op: 'gt', value: 5 }]));
      expect(await list(`filter=${set}`)).toEqual(['Part ten']);

      expect((await call('get', `/api/vault/folders/${chapter}?filter=nonsense`)).status).toBe(400);
      expect((await call('get', `/api/vault/folders/${chapter}?sort=size`)).status).toBe(400);
    });
  });

  describe('search', () => {
    it('finds each kind of thing, says why, and skips the trash', async () => {
      const physics = await folder('Physics');
      const exam = await field('Exam board', 'text');
      const boardFolder = await folder('Mock papers', physics);
      await setValue({ fieldId: exam, folderId: boardFolder, value: 'Dhaka Board' });

      const byName = await note('Gravity basics', physics);
      const byNote = await note('Answer 1', physics, 'Newton showed that gravity is universal.');
      const byLink = (
        await call('post', '/api/vault/items').send({ kind: 'link', folderId: physics, name: 'The chat', url: 'https://claude.ai/gravity-chat' })
      ).body.id;
      const byTag = await note('Untitled', physics);
      await call('put', `/api/vault/items/${byTag}/tags`).send({ tagIds: [await tag('Gravity')] });
      const byField = await note('Paper 2', physics);
      const topic = await field('Topic', 'text');
      await setValue({ fieldId: topic, itemId: byField, value: 'Gravity and orbits' });
      const trashed = await note('Gravity old', physics);
      await prisma.vaultItem.update({ where: { id: trashed }, data: { trashedAt: new Date(), trashRootId: trashed } });

      const found = (await call('get', '/api/vault/search?q=GRAVITY')).body;
      const reasons = Object.fromEntries(found.items.map((item: { id: string; matched: string }) => [item.id, item.matched]));
      expect(reasons).toEqual({ [byName]: 'name', [byNote]: 'note', [byLink]: 'link', [byTag]: 'tag', [byField]: 'field' });
      expect(found.items[0].path.map((step: Named) => step.name)).toEqual(['Physics']);

      const board = (await call('get', '/api/vault/search?q=dhaka board')).body;
      expect(board.folders.map((entry: { name: string; matched: string }) => [entry.name, entry.matched])).toEqual([['Mock papers', 'field']]);
    });

    it('finds Bangla text and says nothing for an empty search', async () => {
      await note('অধ্যায় ৩', null, 'নিউটনের গতিসূত্র');
      expect(names((await call('get', '/api/vault/search?q=গতিসূত্র')).body.items)).toEqual(['অধ্যায় ৩']);
      expect((await call('get', '/api/vault/search?q=%20%20')).body).toEqual({ folders: [], items: [] });
    });
  });
});
