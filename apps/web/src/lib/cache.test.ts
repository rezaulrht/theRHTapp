import { clearCache, readCache, swr, writeCache } from './cache';

function mockFetch(answer: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async () => answer()));
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

describe('cache', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('keeps what was written and gives it back', () => {
    writeCache('/money/reports/today', { spent: 500 });
    expect(readCache('/money/reports/today')).toEqual({ spent: 500 });
    expect(readCache('/nothing')).toBeUndefined();
  });

  it('forgets only its own copies when cleared', () => {
    localStorage.setItem('pa.money.lastAccount', 'bank');
    writeCache('/a', 1);
    writeCache('/b', 2);
    clearCache();
    expect(readCache('/a')).toBeUndefined();
    expect(readCache('/b')).toBeUndefined();
    expect(localStorage.getItem('pa.money.lastAccount')).toBe('bank');
  });

  it('drops the oldest copies once there are too many', () => {
    for (let index = 0; index < 70; index += 1) writeCache(`/day/${index}`, index);
    const left = Object.keys(localStorage).filter((key) => key.startsWith('pa.cache.v1:'));
    expect(left).toHaveLength(60);
    expect(readCache('/day/69')).toBe(69);
    expect(readCache('/day/0')).toBeUndefined();
  });

  it('survives a corrupted copy', () => {
    localStorage.setItem('pa.cache.v1:/broken', '{not json');
    expect(readCache('/broken')).toBeUndefined();
  });
});

describe('swr', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('with no copy, gives only the fresh answer, and keeps it for next time', async () => {
    mockFetch(() => json({ n: 1 }));
    const seen: unknown[] = [];
    await swr('/x', (data) => seen.push(data));
    expect(seen).toEqual([{ n: 1 }]);
    expect(readCache('/x')).toEqual({ n: 1 });
  });

  it('with a copy, gives the copy at once and then the fresh answer', async () => {
    writeCache('/x', { n: 1 });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    mockFetch(async () => {
      await held;
      return json({ n: 2 });
    });
    const seen: unknown[] = [];
    const done = swr('/x', (data) => seen.push(data));
    expect(seen).toEqual([{ n: 1 }]);
    release();
    await done;
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    expect(readCache('/x')).toEqual({ n: 2 });
  });

  it('keeps showing the copy, without an error, when the fresh read fails', async () => {
    writeCache('/x', { n: 1 });
    mockFetch(() => json({ message: 'down' }, 502));
    const seen: unknown[] = [];
    await expect(swr('/x', (data) => seen.push(data))).resolves.toBeUndefined();
    expect(seen).toEqual([{ n: 1 }]);
    expect(readCache('/x')).toEqual({ n: 1 });
  });

  it('throws when the read fails and there is no copy to show', async () => {
    mockFetch(() => json({ message: 'down' }, 502));
    await expect(swr('/x', () => {})).rejects.toThrow('down');
  });
});
