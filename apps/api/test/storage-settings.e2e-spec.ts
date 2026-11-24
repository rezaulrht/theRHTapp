import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { R2Storage } from '../src/vault/storage/r2-storage';
import { DynamicStorage } from '../src/vault/storage/storage-settings';
import { createTestApp, loginAsOwner, resetDb } from './helpers';

const CONFIG = { accountId: 'abc123def456', accessKeyId: 'AKIA1234567890WXYZ', secretAccessKey: 'super-secret-value-999', bucket: 'my-vault-files' };

describe('R2 storage settings', () => {
  let app: INestApplication;
  let cookie: string;
  const http = () => request(app.getHttpServer());
  const save = (body: object) => http().put('/api/storage/r2').set('Cookie', cookie).send(body);
  const status = () => http().get('/api/storage/r2').set('Cookie', cookie);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    cookie = await loginAsOwner(app);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
  });

  it('needs a login', async () => {
    expect((await http().get('/api/storage/r2')).status).toBe(401);
    expect((await http().put('/api/storage/r2').send(CONFIG)).status).toBe(401);
  });

  it('starts with nothing saved', async () => {
    expect((await status()).body).toEqual({ configured: false, source: null, bucket: null, accessKeyEnd: null });
  });

  it('tests the keys, saves them encrypted, switches the Vault to R2 at once, and never sends them back', async () => {
    const check = jest.spyOn(R2Storage.prototype, 'check').mockResolvedValue();
    expect((await save(CONFIG)).status).toBe(204);
    expect(check).toHaveBeenCalledTimes(1);

    expect((await status()).body).toEqual({ configured: true, source: 'settings', bucket: 'my-vault-files', accessKeyEnd: 'WXYZ' });
    expect(app.get(DynamicStorage).ready).toBe(true);

    const rows = JSON.stringify(await app.get(PrismaService).setting.findMany());
    for (const secret of [CONFIG.secretAccessKey, CONFIG.accessKeyId, CONFIG.accountId]) expect(rows).not.toContain(secret);
    for (const res of [await status(), await http().get('/api/settings').set('Cookie', cookie), await http().get('/api/export').set('Cookie', cookie)]) {
      expect(JSON.stringify(res.body)).not.toContain(CONFIG.secretAccessKey);
    }
  });

  it('saves nothing when the keys do not work, and says why', async () => {
    jest.spyOn(R2Storage.prototype, 'check').mockRejectedValue(Object.assign(new Error('x'), { name: 'InvalidAccessKeyId' }));
    const res = await save(CONFIG);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Cloudflare did not accept those keys.');
    expect((await status()).body.configured).toBe(false);

    jest.spyOn(R2Storage.prototype, 'check').mockRejectedValue(Object.assign(new Error('x'), { name: 'NoSuchBucket' }));
    expect((await save(CONFIG)).body.message).toBe('That bucket does not exist in this account.');
  });

  it('refuses details that are missing or badly formed', async () => {
    const check = jest.spyOn(R2Storage.prototype, 'check').mockResolvedValue();
    expect((await save({ ...CONFIG, bucket: 'Bad Bucket!' })).status).toBe(400);
    expect((await save({ ...CONFIG, secretAccessKey: '' })).status).toBe(400);
    expect((await save({ accountId: CONFIG.accountId })).status).toBe(400);
    expect(check).not.toHaveBeenCalled();
  });

  it('goes back to the server setup when the saved keys are removed', async () => {
    jest.spyOn(R2Storage.prototype, 'check').mockResolvedValue();
    await save(CONFIG);
    expect((await http().delete('/api/storage/r2').set('Cookie', cookie)).status).toBe(204);
    expect((await status()).body.configured).toBe(false);
  });
});
