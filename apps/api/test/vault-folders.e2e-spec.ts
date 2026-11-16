import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FoldersService } from '../src/vault/folders';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

interface Named {
  id: string;
  name: string;
}

describe('vault folders, notes and links', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let folders: FoldersService;
  let cookie: string;
  let minute = 0;
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch', url: string) => http()[method](url).set('Cookie', cookie);
  const folder = async (name: string, parentId: string | null = null): Promise<string> =>
    (await call('post', '/api/vault/folders').send({ parentId, name })).body.id;
  const note = async (name: string, folderId: string | null, body = ''): Promise<string> =>
    (await call('post', '/api/vault/items').send({ kind: 'note', folderId, name, body })).body.id;
  const names = (list: Named[]) => list.map((entry) => entry.name);
  const open = async (id: string) => (await call('get', `/api/vault/folders/${id}`)).body;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    folders = app.get(FoldersService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    // Each call moves the clock on a minute, so "opened last" is never a tie.
    minute = 0;
    folders.clock = () => new Date(Date.UTC(2026, 10, 16, 9, minute++));
  });

  afterAll(async () => {
    await app.close();
  });

  it('needs a session', async () => {
    expect((await http().get('/api/vault/home')).status).toBe(401);
  });

  it('nests folders to any depth and gives each its path', async () => {
    const education = await folder('Education');
    const physics = await folder('Physics', education);
    const chapter = await folder('Chapter 3', physics);
    const topic = await folder('Topic 1', chapter);
    const part = await folder('Part a', topic);

    const body = await open(part);
    expect(body.folder.path.map((step: Named) => step.name)).toEqual(['Education', 'Physics', 'Chapter 3', 'Topic 1', 'Part a']);
    expect(names((await open(physics)).folders)).toEqual(['Chapter 3']);
    expect(names((await open('root')).folders)).toEqual(['Education']);
  });

  it('keeps any name as written', async () => {
    const tricky = ['পদার্থবিজ্ঞান', 'Mr "K" notes', 'A/B testing', 'Exam 🔥', "Owner's work"];
    for (const name of tricky) await folder(name);
    expect(names((await open('root')).folders)).toEqual(tricky);
    const id = await note('নোট: অধ্যায় ৩', null, '# শিরোনাম\n\nএকটি উত্তর');
    const item = (await call('get', `/api/vault/items/${id}`)).body;
    expect(item).toMatchObject({ name: 'নোট: অধ্যায় ৩', body: '# শিরোনাম\n\nএকটি উত্তর' });
  });

  it('refuses an empty name and an unknown parent', async () => {
    expect((await call('post', '/api/vault/folders').send({ parentId: null, name: '  ' })).body.errors[0].path).toBe('name');
    const unknown = await call('post', '/api/vault/folders').send({ parentId: 'nope', name: 'X' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.errors[0].path).toBe('parentId');
  });

  it('makes, edits and lists notes and links', async () => {
    const chapter = await folder('Chapter 3');
    const id = await note('Newton’s laws', chapter, '## First law\n\nAn object at rest…');
    const link = await call('post', '/api/vault/items').send({ kind: 'link', folderId: chapter, name: 'The chat', url: 'https://claude.ai/chat/abc' });
    expect(link.status).toBe(201);
    expect(link.body).toMatchObject({ kind: 'link', url: 'https://claude.ai/chat/abc', file: null });

    const edited = await call('patch', `/api/vault/items/${id}`).send({ body: '## First law\n\nRevised.', name: 'Newton' });
    expect(edited.body).toMatchObject({ name: 'Newton', body: '## First law\n\nRevised.' });

    const listing = await open(chapter);
    expect(listing.items.map((item: { name: string; kind: string }) => [item.name, item.kind])).toEqual([
      ['Newton', 'note'],
      ['The chat', 'link'],
    ]);
    // Lists carry the start of a note, not the whole of it.
    expect(listing.items[0]).toMatchObject({ body: null, excerpt: '## First law\n\nRevised.' });
    expect(listing.items[0].path.map((step: Named) => step.name)).toEqual(['Chapter 3']);
  });

  it('a link needs a web address, and a note cannot be given one', async () => {
    const bad = await call('post', '/api/vault/items').send({ kind: 'link', folderId: null, name: 'X', url: 'claude.ai' });
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].path).toBe('url');
    const id = await note('N', null);
    expect((await call('patch', `/api/vault/items/${id}`).send({ url: 'https://example.com' })).body.errors[0].path).toBe('url');
  });

  it('moves several folders and items at once', async () => {
    const physics = await folder('Physics');
    const archive = await folder('Archive');
    const a = await folder('Chapter 1', physics);
    const b = await folder('Chapter 2', physics);
    const n = await note('Loose note', physics);

    const res = await call('post', '/api/vault/move').send({ folderIds: [a, b], itemIds: [n], targetId: archive });
    expect(res.status).toBe(204);
    const moved = await open(archive);
    expect(names(moved.folders)).toEqual(['Chapter 1', 'Chapter 2']);
    expect(names(moved.items)).toEqual(['Loose note']);
    expect(moved.folders[0].path.map((step: Named) => step.name)).toEqual(['Archive', 'Chapter 1']);

    // And back out to the top level.
    await call('post', '/api/vault/move').send({ folderIds: [a], itemIds: [], targetId: null });
    expect(names((await open('root')).folders)).toContain('Chapter 1');
  });

  it('refuses to put a folder inside itself, and then moves nothing', async () => {
    const physics = await folder('Physics');
    const chapter = await folder('Chapter 3', physics);
    const topic = await folder('Topic', chapter);
    const other = await folder('Other');

    for (const target of [physics, topic]) {
      const res = await call('post', '/api/vault/move').send({ folderIds: [other, physics], itemIds: [], targetId: target });
      expect(res.status).toBe(400);
      expect(res.body.errors[0]).toEqual({ path: 'targetId', message: 'A folder cannot go inside itself' });
    }
    // "Other" was listed first but did not move either.
    expect(names((await open('root')).folders)).toEqual(['Physics', 'Other']);
  });

  it('refuses to move something that is not there', async () => {
    const target = await folder('Target');
    expect((await call('post', '/api/vault/move').send({ folderIds: ['nope'], targetId: target })).status).toBe(400);
    expect((await call('post', '/api/vault/move').send({ itemIds: ['nope'], targetId: target })).status).toBe(400);
    expect((await call('post', '/api/vault/move').send({ itemIds: [], targetId: 'nope' })).status).toBe(400);
  });

  it('reorders a folder’s contents, and needs everything listed', async () => {
    const parent = await folder('Parent');
    const x = await folder('X', parent);
    const y = await folder('Y', parent);
    const n1 = await note('One', parent);
    const n2 = await note('Two', parent);
    expect((await call('post', `/api/vault/folders/${parent}/reorder`).send({ folderIds: [y], itemIds: [n2, n1] })).status).toBe(400);
    expect((await call('post', `/api/vault/folders/${parent}/reorder`).send({ folderIds: [y, x], itemIds: [n2, n1] })).status).toBe(204);
    const body = await open(parent);
    expect(names(body.folders)).toEqual(['Y', 'X']);
    expect(names(body.items)).toEqual(['Two', 'One']);
  });

  it('pins and unpins, and the front page shows pins and what was opened last', async () => {
    const physics = await folder('Physics');
    const a = await note('A', physics);
    const b = await note('B', physics);
    await call('patch', `/api/vault/folders/${physics}`).send({ pinned: true });
    await call('patch', `/api/vault/items/${b}`).send({ pinned: true });
    await call('get', `/api/vault/items/${a}`);

    let home = (await call('get', '/api/vault/home')).body;
    expect(names(home.pinned.folders)).toEqual(['Physics']);
    expect(names(home.pinned.items)).toEqual(['B']);
    expect(home.recent[0].name).toBe('A');
    expect(names(home.folders)).toEqual(['Physics']);

    await call('get', `/api/vault/items/${b}`);
    await call('patch', `/api/vault/items/${b}`).send({ pinned: false });
    home = (await call('get', '/api/vault/home')).body;
    expect(home.pinned.items).toEqual([]);
    expect(names(home.recent).slice(0, 2)).toEqual(['B', 'A']);
  });

  it('never lists, opens or moves into something in the trash', async () => {
    const kept = await folder('Kept');
    const gone = await folder('Gone');
    const goneNote = await note('Gone note', kept);
    await prisma.vaultFolder.update({ where: { id: gone }, data: { trashedAt: new Date(), trashRootId: gone } });
    await prisma.vaultItem.update({ where: { id: goneNote }, data: { trashedAt: new Date(), trashRootId: goneNote } });

    expect(names((await open('root')).folders)).toEqual(['Kept']);
    expect((await open(kept)).items).toEqual([]);
    expect((await call('get', `/api/vault/folders/${gone}`)).status).toBe(404);
    expect((await call('get', `/api/vault/items/${goneNote}`)).status).toBe(404);
    expect((await call('post', '/api/vault/move').send({ folderIds: [kept], targetId: gone })).status).toBe(400);
  });
});
