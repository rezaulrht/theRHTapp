import { createHash } from 'node:crypto';
import { CacheService, MemoryStore } from '../cache/cache.service';
import { AuthService } from './auth.service';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-11-23T12:00:00Z');
const token = 'a-session-token';
const tokenHash = createHash('sha256').update(token).digest('hex');

/** Just enough of the database for session checks, counting how often it is asked. */
function fakeDb(session: { expiresAt: Date; lastUsedAt: Date } | null) {
  const state = {
    reads: 0,
    row: session && { id: 's1', userId: 'u1', tokenHash, user: { email: 'owner@example.test' }, ...session },
  };
  const db = {
    get reads() {
      return state.reads;
    },
    session: {
      findUnique: jest.fn(async () => {
        state.reads += 1;
        return state.row;
      }),
      update: jest.fn(async () => undefined),
      deleteMany: jest.fn(async () => {
        state.row = null;
      }),
      findMany: jest.fn(async () => [{ tokenHash: 'other-device-hash' }]),
    },
    user: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async () => undefined),
  };
  return db;
}

function setup(session: Parameters<typeof fakeDb>[0]) {
  const db = fakeDb(session);
  const cache = new CacheService({ NODE_ENV: 'development' }).useStore(new MemoryStore());
  const auth = new AuthService(db as never, cache);
  return { db, cache, auth };
}

describe('session checks with a copy kept nearby', () => {
  it('asks the database once, then answers from the copy', async () => {
    const { db, auth } = setup({ expiresAt: new Date(now.getTime() + 10 * DAY), lastUsedAt: now });
    const first = await auth.validate(token, now);
    const second = await auth.validate(token, now);
    expect(first).toEqual({ userId: 'u1', sessionId: 's1', email: 'owner@example.test' });
    expect(second).toEqual(first);
    expect(db.reads).toBe(1);
  });

  it('does not trust a copy for a token it has never seen, or a session that is gone', async () => {
    const { db, auth } = setup(null);
    expect(await auth.validate(token, now)).toBeNull();
    expect(await auth.validate(token, now)).toBeNull();
    expect(db.reads).toBe(2);
  });

  it('stops trusting the copy the moment the session expires, and removes it', async () => {
    const { db, auth } = setup({ expiresAt: new Date(now.getTime() + 60_000), lastUsedAt: now });
    expect(await auth.validate(token, now)).not.toBeNull();
    const later = new Date(now.getTime() + 61_000);
    expect(await auth.validate(token, later)).toBeNull();
    expect(db.session.deleteMany).toHaveBeenCalled();
  });

  it('goes back to the database to renew a session that has not been used for a day', async () => {
    const { db, auth } = setup({ expiresAt: new Date(now.getTime() + 10 * DAY), lastUsedAt: now });
    await auth.validate(token, now);
    const nextDay = new Date(now.getTime() + DAY + 1000);
    const result = await auth.validate(token, nextDay);
    expect(result?.renewedUntil).toBeDefined();
    expect(db.session.update).toHaveBeenCalledTimes(1);
    expect(db.reads).toBe(2);
  });

  it('logging out removes the copy at once, so the old cookie stops working', async () => {
    const { db, auth } = setup({ expiresAt: new Date(now.getTime() + 10 * DAY), lastUsedAt: now });
    await auth.validate(token, now);
    await auth.logout('s1');
    expect(await auth.validate(token, now)).toBeNull();
    expect(db.reads).toBe(3); // first check, the lookup logout does, and the check after logging out
  });
});
