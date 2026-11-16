import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { FilesService } from '../src/vault/files';
import { FoldersService } from '../src/vault/folders';
import { contentDisposition, FILE_STORAGE, type FileStorage } from '../src/vault/storage/file-storage';
import { LocalFileStorage } from '../src/vault/storage/local-storage';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

/** Storage kept in memory. A test "uploads" by putting bytes under the key. */
class FakeStorage implements FileStorage {
  ready = true;
  objects = new Map<string, Buffer>();
  removed: string[] = [];
  failRemove = false;
  async uploadUrl(key: string, mimeType: string) {
    return { url: `https://storage.example.test/${key}?signed=up`, headers: { 'Content-Type': mimeType } };
  }
  async downloadUrl(key: string, fileName: string, _mimeType: string, inline: boolean) {
    return `https://storage.example.test/${key}?signed=down&cd=${encodeURIComponent(contentDisposition(fileName, inline))}`;
  }
  async size(key: string) {
    return this.objects.get(key)?.length ?? null;
  }
  async read(key: string, maxBytes: number) {
    return (this.objects.get(key) ?? Buffer.alloc(0)).subarray(0, maxBytes);
  }
  async remove(key: string) {
    if (this.failRemove) throw new Error('storage is down');
    this.removed.push(key);
    this.objects.delete(key);
  }
}

const MB = 1024 ** 2;

describe('vault files', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  const storage = new FakeStorage();
  const http = () => request(app.getHttpServer());
  const call = (method: 'get' | 'post' | 'patch', url: string) => http()[method](url).set('Cookie', cookie);

  async function start(name: string, size: number, mimeType = 'application/pdf', folderId: string | null = null) {
    return call('post', '/api/vault/files').send({ folderId, name, size, mimeType });
  }
  /** Starts an upload, puts the bytes in storage, and confirms it. */
  async function upload(name: string, bytes: Buffer, mimeType = 'application/pdf', folderId: string | null = null) {
    const started = (await start(name, bytes.length, mimeType, folderId)).body;
    const key = new URL(started.upload.url).pathname.slice(1);
    storage.objects.set(key, bytes);
    return call('post', `/api/vault/files/${started.item.id}/complete`);
  }

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(FILE_STORAGE).useValue(storage));
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
    storage.objects.clear();
    storage.removed = [];
    storage.ready = true;
    storage.failRemove = false;
  });

  afterAll(async () => {
    await app.close();
  });

  it('a file appears only once its upload is confirmed', async () => {
    const folder = (await call('post', '/api/vault/folders').send({ parentId: null, name: 'Physics' })).body.id;
    const started = await start('Lecture 3.pdf', 1200, 'application/pdf', folder);
    expect(started.status).toBe(201);
    expect(started.body.upload).toEqual({
      url: expect.stringMatching(/^https:\/\/storage\.example\.test\/vault\//),
      headers: { 'Content-Type': 'application/pdf' },
    });
    expect(started.body.item.file).toEqual({ size: 1200, mimeType: 'application/pdf', uploaded: false });
    // Not listed and not openable while the upload is unfinished.
    expect((await call('get', `/api/vault/folders/${folder}`)).body.items).toEqual([]);
    expect((await call('get', `/api/vault/items/${started.body.item.id}`)).status).toBe(404);

    const key = new URL(started.body.upload.url).pathname.slice(1);
    // The key is never the file's name.
    expect(key).not.toContain('Lecture');
    storage.objects.set(key, Buffer.alloc(1180));
    const done = await call('post', `/api/vault/files/${started.body.item.id}/complete`);
    expect(done.status).toBe(201);
    // The stored size is what counts.
    expect(done.body.file).toEqual({ size: 1180, mimeType: 'application/pdf', uploaded: true });
    expect((await call('get', `/api/vault/folders/${folder}`)).body.items.map((item: { name: string }) => item.name)).toEqual(['Lecture 3.pdf']);
  });

  it('completing before the file arrived says so and keeps the upload open', async () => {
    const started = (await start('slides.pdf', 10)).body;
    const res = await call('post', `/api/vault/files/${started.item.id}/complete`);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The file did not arrive. Try the upload again.');
    expect(await prisma.vaultItem.count()).toBe(1);
  });

  it('refuses a file over the limit before it is sent', async () => {
    await call('patch', '/api/settings').send({ 'vault.maxFileMb': 5 });
    const res = await start('big.pdf', 5 * MB + 1);
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({ path: 'size', message: 'Files can be up to 5 MB' });
    expect(await prisma.vaultItem.count()).toBe(0);
  });

  it('refuses a stored file larger than the limit, and removes it', async () => {
    await call('patch', '/api/settings').send({ 'vault.maxFileMb': 1 });
    const started = (await start('claims-small.pdf', 100)).body;
    const key = new URL(started.upload.url).pathname.slice(1);
    storage.objects.set(key, Buffer.alloc(MB + 1));
    const res = await call('post', `/api/vault/files/${started.item.id}/complete`);
    expect(res.status).toBe(400);
    expect(storage.removed).toEqual([key]);
    expect(await prisma.vaultItem.count()).toBe(0);
  });

  it('gives a short-lived address that keeps a Bangla file name', async () => {
    const item = (await upload('অধ্যায় ৩ "নোট".pdf', Buffer.from('%PDF'))).body;
    const res = await call('get', `/api/vault/files/${item.id}/url?inline=1`);
    const disposition = new URL(res.body.url).searchParams.get('cd')!;
    expect(disposition.startsWith('inline; filename="')).toBe(true);
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent('অধ্যায় ৩ "নোট".pdf')}`);
    expect(contentDisposition('a"b\\c.pdf', false)).toBe(`attachment; filename="a_b_c.pdf"; filename*=UTF-8''a%22b%5Cc.pdf`);
  });

  it('reads a markdown file as text, and refuses a PDF', async () => {
    const md = (await upload('answer.md', Buffer.from('# Newton\n\nএকটি উত্তর'), 'text/markdown')).body;
    expect((await call('get', `/api/vault/files/${md.id}/text`)).body).toEqual({ text: '# Newton\n\nএকটি উত্তর' });
    // Some systems send no type for .md files; the name is enough.
    const plain = (await upload('notes.md', Buffer.from('hello'), '')).body;
    expect(plain.file.mimeType).toBe('application/octet-stream');
    expect((await call('get', `/api/vault/files/${plain.id}/text`)).body.text).toBe('hello');
    const pdf = (await upload('slides.pdf', Buffer.from('%PDF'))).body;
    expect((await call('get', `/api/vault/files/${pdf.id}/text`)).status).toBe(400);
  });

  it('counts the space used by finished files', async () => {
    await upload('a.pdf', Buffer.alloc(1000));
    await upload('b.pdf', Buffer.alloc(500));
    await start('unfinished.pdf', 99999);
    expect((await call('get', '/api/vault/storage')).body).toEqual({ used: 1500, allowance: 10 * 1024 ** 3, files: 2 });
  });

  it('clears uploads left unfinished for a day, keeping any it could not remove', async () => {
    const folders = app.get(FoldersService);
    const files = app.get(FilesService);
    folders.clock = () => new Date('2026-11-14T09:00:00Z');
    const old = (await start('old.pdf', 10)).body;
    folders.clock = () => new Date('2026-11-16T08:00:00Z');
    const fresh = (await start('fresh.pdf', 10)).body;
    await upload('done.pdf', Buffer.alloc(5));

    storage.failRemove = true;
    expect(await files.cleanUnfinished(new Date('2026-11-16T09:00:00Z'))).toBe(0);
    storage.failRemove = false;
    expect(await files.cleanUnfinished(new Date('2026-11-16T09:00:00Z'))).toBe(1);
    expect(await prisma.vaultItem.findUnique({ where: { id: old.item.id } })).toBeNull();
    expect(await prisma.vaultItem.findUnique({ where: { id: fresh.item.id } })).not.toBeNull();
    expect(await prisma.vaultItem.count()).toBe(2);
    folders.clock = () => new Date();
  });

  it('says plainly when storage is not set up', async () => {
    storage.ready = false;
    const res = await start('a.pdf', 10);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('File storage is not set up yet');
  });
});

describe('local file storage', () => {
  let app: INestApplication;
  let local: LocalFileStorage;
  let dir: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vault-files-'));
    process.env.LOCAL_FILES_DIR = dir;
    app = await createTestApp();
    local = app.get(LocalFileStorage);
  });

  afterAll(async () => {
    await app.close();
    delete process.env.LOCAL_FILES_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it('takes a file on its signed address and gives it back, with its name', async () => {
    const up = await local.uploadUrl('vault/abc', 'text/markdown', 11);
    expect(up.url).toMatch(/^\/api\/vault\/local\//);
    expect((await http().put(up.url).set('Content-Type', 'text/markdown').send(Buffer.from('hello world'))).status).toBe(200);
    expect(await local.size('vault/abc')).toBe(11);
    expect((await local.read('vault/abc', 5)).toString()).toBe('hello');

    const down = await local.downloadUrl('vault/abc', 'নোট.md', 'text/markdown', false);
    const res = await http().get(down).buffer(true).parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect((res.body as Buffer).toString()).toBe('hello world');
    expect(res.headers['content-disposition']).toContain(encodeURIComponent('নোট.md'));

    await local.remove('vault/abc');
    expect(await local.size('vault/abc')).toBeNull();
  });

  it('refuses an altered, expired or wrong-way address', async () => {
    const up = await local.uploadUrl('vault/x', 'text/plain', 5);
    const altered = up.url.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    expect((await http().put(altered).send(Buffer.from('hi'))).status).toBe(403);
    // An upload address cannot be used to read.
    expect((await http().get(up.url)).status).toBe(403);
    // Nor to send more than was asked for.
    expect((await http().put(up.url).set('Content-Type', 'text/plain').send(Buffer.from('much too long'))).status).toBe(403);

    local.clock = () => Date.now() + 16 * 60_000;
    expect((await http().put(up.url).set('Content-Type', 'text/plain').send(Buffer.from('hi'))).status).toBe(403);
    local.clock = () => Date.now();
  });

  it('never reaches outside its folder', async () => {
    await expect(local.size('../../etc/passwd')).resolves.toBeNull();
    await expect(local.read('../outside', 10)).rejects.toThrow();
  });
});
