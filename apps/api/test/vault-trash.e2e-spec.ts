import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { FoldersService } from '../src/vault/folders';
import { FILE_STORAGE, type FileStorage } from '../src/vault/storage/file-storage';
import { TrashService } from '../src/vault/trash';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

class FakeStorage implements FileStorage {
  ready = true;
  objects = new Map<string, Buffer>();
  removed: string[] = [];
  failFor = new Set<string>();
  async uploadUrl(key: string) {
    return { url: `https://storage.example.test/${key}`, headers: {} };
  }
  async downloadUrl(key: string) {
    return `https://storage.example.test/${key}`;
  }
  async size(key: string) {
    return this.objects.get(key)?.length ?? null;
  }
  async read() {
    return Buffer.alloc(0);
  }
  async remove(key: string) {
    if (this.failFor.has(key)) throw new Error('storage is down');
    this.removed.push(key);
    this.objects.delete(key);
  }
}

interface Named {
  id: string;
  name: string;
}

describe('vault trash', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let trash: TrashService;
  let folders: FoldersService;
  let cookie: string;
  const storage = new FakeStorage();
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch' | 'delete' | 'put', url: string) => http()[method](url).set('Cookie', cookie);
  const folder = async (name: string, parentId: string | null = null): Promise<string> =>
    (await call('post', '/api/vault/folders').send({ parentId, name })).body.id;
  const note = async (name: string, folderId: string | null): Promise<string> =>
    (await call('post', '/api/vault/items').send({ kind: 'note', folderId, name })).body.id;
  async function file(name: string, folderId: string | null): Promise<{ id: string; key: string }> {
    const started = (await call('post', '/api/vault/files').send({ folderId, name, size: 4, mimeType: 'application/pdf' })).body;
    const key = new URL(started.upload.url).pathname.slice(1);
    storage.objects.set(key, Buffer.from('%PDF'));
    await call('post', `/api/vault/files/${started.item.id}/complete`);
    return { id: started.item.id, key };
  }
  const names = (list: Named[]) => list.map((entry) => entry.name);
  const top = async () => (await call('get', '/api/vault/folders/root')).body;

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(FILE_STORAGE).useValue(storage));
    prisma = app.get(PrismaService);
    trash = app.get(TrashService);
    folders = app.get(FoldersService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    storage.objects.clear();
    storage.removed = [];
    storage.failFor.clear();
    folders.clock = () => new Date('2026-11-16T09:00:00Z');
  });

  afterAll(async () => {
    await app.close();
  });

  /** Physics › Chapter 3 › Topic, with a note and a file in Chapter 3. */
  async function tree() {
    const physics = await folder('Physics');
    const chapter = await folder('Chapter 3', physics);
    const topic = await folder('Topic', chapter);
    const answer = await note('Newton answer', chapter);
    const pdf = await file('slides.pdf', chapter);
    return { physics, chapter, topic, answer, pdf };
  }

  it('deleting a folder hides it and everything inside it, from lists, search and pins', async () => {
    const t = await tree();
    await call('patch', `/api/vault/items/${t.answer}`).send({ pinned: true });
    expect((await call('delete', `/api/vault/folders/${t.chapter}`)).status).toBe(204);

    expect((await call('get', `/api/vault/folders/${t.physics}`)).body.folders).toEqual([]);
    expect((await call('get', `/api/vault/folders/${t.topic}`)).status).toBe(404);
    expect((await call('get', `/api/vault/items/${t.answer}`)).status).toBe(404);
    expect((await call('get', '/api/vault/search?q=newton')).body.items).toEqual([]);
    expect((await call('get', '/api/vault/home')).body.pinned.items).toEqual([]);

    const listed = (await call('get', '/api/vault/trash')).body;
    expect(listed).toEqual([
      {
        id: t.chapter,
        kind: 'folder',
        name: 'Chapter 3',
        trashedAt: '2026-11-16T09:00:00.000Z',
        removeAt: '2026-12-16T09:00:00.000Z',
        folders: 1,
        items: 2,
      },
    ]);
  });

  it('restoring brings everything back where it was', async () => {
    const t = await tree();
    await call('delete', `/api/vault/folders/${t.chapter}`);
    expect((await call('post', `/api/vault/trash/${t.chapter}/restore`)).status).toBe(204);
    const physics = (await call('get', `/api/vault/folders/${t.physics}`)).body;
    expect(names(physics.folders)).toEqual(['Chapter 3']);
    expect(names((await call('get', `/api/vault/folders/${t.chapter}`)).body.items)).toEqual(['Newton answer', 'slides.pdf']);
    expect((await call('get', '/api/vault/trash')).body).toEqual([]);
  });

  it('something deleted on its own keeps its own place in the trash', async () => {
    const t = await tree();
    await call('delete', `/api/vault/items/${t.answer}`);
    await call('delete', `/api/vault/folders/${t.chapter}`);
    expect(names((await call('get', '/api/vault/trash')).body).sort()).toEqual(['Chapter 3', 'Newton answer']);
    // Restoring the chapter does not bring back the note deleted before it.
    await call('post', `/api/vault/trash/${t.chapter}/restore`);
    expect(names((await call('get', `/api/vault/folders/${t.chapter}`)).body.items)).toEqual(['slides.pdf']);
  });

  it('restores to the top level when the folder it was in is in the trash or gone', async () => {
    const t = await tree();
    await call('delete', `/api/vault/items/${t.answer}`);
    await call('delete', `/api/vault/folders/${t.topic}`);
    await call('delete', `/api/vault/folders/${t.physics}`);

    await call('post', `/api/vault/trash/${t.answer}/restore`);
    await call('post', `/api/vault/trash/${t.topic}/restore`);
    const root = await top();
    expect(names(root.items)).toEqual(['Newton answer']);
    expect(names(root.folders)).toEqual(['Topic']);
    expect((await call('get', `/api/vault/items/${t.answer}`)).status).toBe(200);
  });

  it('emptying the trash removes rows and stored files for good', async () => {
    const t = await tree();
    const kept = await note('Kept', null);
    await call('delete', `/api/vault/folders/${t.physics}`);
    const res = await call('delete', '/api/vault/trash');
    expect(res.body).toEqual({ left: 0 });
    expect(storage.removed).toEqual([t.pdf.key]);
    expect(await prisma.vaultFolder.count()).toBe(0);
    expect(await prisma.vaultItem.count()).toBe(1);
    expect((await call('get', `/api/vault/items/${kept}`)).status).toBe(200);
    expect((await call('get', '/api/vault/storage')).body.used).toBe(0);
  });

  it('keeps a file it could not remove, and its folder, for next time', async () => {
    const t = await tree();
    await call('delete', `/api/vault/folders/${t.physics}`);
    storage.failFor.add(t.pdf.key);
    expect((await call('delete', '/api/vault/trash')).body).toEqual({ left: 1 });
    expect(await prisma.vaultItem.findUnique({ where: { id: t.pdf.id } })).not.toBeNull();
    expect(await prisma.vaultItem.findUnique({ where: { id: t.answer } })).toBeNull();
    // The folders holding it stay too; the empty one inside is gone.
    expect((await prisma.vaultFolder.findMany()).map((row) => row.name).sort()).toEqual(['Chapter 3', 'Physics']);

    storage.failFor.clear();
    expect((await call('delete', '/api/vault/trash')).body).toEqual({ left: 0 });
    expect(await prisma.vaultFolder.count()).toBe(0);
  });

  it('removes things once the trash period has passed, and not before', async () => {
    await call('patch', '/api/settings').send({ 'vault.trashDays': 7 });
    const old = await note('Old', null);
    const recent = await note('Recent', null);
    folders.clock = () => new Date('2026-11-01T09:00:00Z');
    await call('delete', `/api/vault/items/${old}`);
    folders.clock = () => new Date('2026-11-14T09:00:00Z');
    await call('delete', `/api/vault/items/${recent}`);

    await trash.purgeExpired(new Date('2026-11-16T09:00:00Z'));
    expect(names((await call('get', '/api/vault/trash')).body)).toEqual(['Recent']);
  });

  it('removes the reminders of what it removes', async () => {
    const t = await tree();
    await prisma.reminder.create({
      data: { ownerType: 'vault', ownerId: `item:${t.answer}`, title: 'Revise', body: '', url: '/vault', schedule: { kind: 'once', at: '2026-12-01T03:00:00Z' }, channels: ['push'] },
    });
    await call('delete', `/api/vault/folders/${t.physics}`);
    await call('delete', '/api/vault/trash');
    expect(await prisma.reminder.count()).toBe(0);
  });

  it('refuses what is not there', async () => {
    expect((await call('delete', '/api/vault/folders/nope')).status).toBe(404);
    expect((await call('delete', '/api/vault/items/nope')).status).toBe(404);
    expect((await call('post', '/api/vault/trash/nope/restore')).status).toBe(404);
  });
});
