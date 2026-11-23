import { CacheService, MemoryStore, UpstashStore } from './cache.service';

const redis = { UPSTASH_REDIS_REST_URL: 'https://redis.example.test', UPSTASH_REDIS_REST_TOKEN: 'secret-token' };

describe('MemoryStore', () => {
  afterEach(() => jest.useRealTimers());

  it('gives back what was kept until it runs out', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-23T00:00:00Z'));
    const store = new MemoryStore();
    await store.set('a', '1', 10);
    expect(await store.get('a')).toBe('1');
    jest.setSystemTime(new Date('2026-11-23T00:00:11Z'));
    expect(await store.get('a')).toBeNull();
  });

  it('forgets deleted keys and ignores keys it never had', async () => {
    const store = new MemoryStore();
    await store.set('a', '1', 60);
    await store.set('b', '2', 60);
    await store.del(['a', 'never']);
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBe('2');
  });
});

describe('UpstashStore', () => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it('sends each command as a JSON array with the token, and reads the result', async () => {
    const send = jest.fn(async () => reply({ result: 'value' })) as unknown as typeof fetch & jest.Mock;
    const store = new UpstashStore(redis.UPSTASH_REDIS_REST_URL, redis.UPSTASH_REDIS_REST_TOKEN, send);

    expect(await store.get('k')).toBe('value');
    await store.set('k', 'v', 30);
    await store.del(['k', 'j']);

    const sent = send.mock.calls.map(([url, init]) => ({ url, body: JSON.parse(init!.body as string), auth: (init!.headers as Record<string, string>).Authorization }));
    expect(sent.map((call) => call.body)).toEqual([['GET', 'k'], ['SET', 'k', 'v', 'EX', 30], ['DEL', 'k', 'j']]);
    expect(sent.every((call) => call.url === redis.UPSTASH_REDIS_REST_URL && call.auth === 'Bearer secret-token')).toBe(true);
  });

  it('reads a missing key as nothing', async () => {
    const store = new UpstashStore('https://x.test', 't', (async () => reply({ result: null })) as unknown as typeof fetch);
    expect(await store.get('missing')).toBeNull();
  });

  it('never throws: an error answer, a network failure or a slow reply all read as nothing', async () => {
    const answers: (typeof fetch)[] = [
      (async () => reply({ error: 'WRONGPASS' }, 401)) as unknown as typeof fetch,
      (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
      (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch,
    ];
    for (const send of answers) {
      const store = new UpstashStore('https://x.test', 't', send);
      await expect(store.get('k')).resolves.toBeNull();
      await expect(store.set('k', 'v', 5)).resolves.toBeUndefined();
      await expect(store.del(['k'])).resolves.toBeUndefined();
    }
  });

  it('sends nothing to delete no keys', async () => {
    const send = jest.fn() as unknown as typeof fetch & jest.Mock;
    await new UpstashStore('https://x.test', 't', send).del([]);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('CacheService', () => {
  it('keeps JSON, with keys that differ between development and production', async () => {
    const store = new MemoryStore();
    const development = new CacheService({ NODE_ENV: 'development' }).useStore(store);
    const production = new CacheService({ NODE_ENV: 'production' }).useStore(store);

    await development.setJson('settings', { a: 1 }, 60);
    expect(await development.getJson('settings')).toEqual({ a: 1 });
    expect(await production.getJson('settings')).toBeNull();

    await development.del('settings');
    expect(await development.getJson('settings')).toBeNull();
  });

  it('reads something that is not JSON as nothing', async () => {
    const store = new MemoryStore();
    await store.set('pa:development:odd', '{not json', 60);
    expect(await new CacheService({ NODE_ENV: 'development' }).useStore(store).getJson('odd')).toBeNull();
  });

  it('is shared only when Redis is set up, and keeps nothing at all in tests', async () => {
    expect(new CacheService({ NODE_ENV: 'development' }).shared).toBe(false);
    expect(new CacheService({ NODE_ENV: 'production', ...redis }).shared).toBe(true);

    const test = new CacheService({ NODE_ENV: 'test', ...redis });
    await test.setJson('x', 1, 60);
    expect(await test.getJson('x')).toBeNull();
    expect(test.shared).toBe(false);
  });
});
