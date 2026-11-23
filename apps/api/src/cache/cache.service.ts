import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../env';

/** Somewhere to keep text for a while. Every method is allowed to fail quietly: the cache must never break a request. */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(keys: string[]): Promise<void>;
}

/** Keeps nothing. Used in tests, which empty the database behind the app's back. */
class OffStore implements CacheStore {
  async get(): Promise<string | null> {
    return null;
  }
  async set(): Promise<void> {}
  async del(): Promise<void> {}
}

/** Kept in this server's memory: lost on restart and not shared. Used when no Redis is set up. */
export class MemoryStore implements CacheStore {
  private readonly items = new Map<string, { value: string; until: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.items.get(key);
    if (!item) return null;
    if (item.until <= Date.now()) {
      this.items.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.items.set(key, { value, until: Date.now() + ttlSeconds * 1000 });
    // Keep it small: drop what has run out once it grows.
    if (this.items.size > 500) {
      const now = Date.now();
      for (const [name, item] of this.items) if (item.until <= now) this.items.delete(name);
    }
  }

  async del(keys: string[]): Promise<void> {
    for (const key of keys) this.items.delete(key);
  }
}

/** Upstash Redis over its HTTPS interface, so no connection is held open. */
export class UpstashStore implements CacheStore {
  private readonly logger = new Logger('Cache');
  private lastWarning = 0;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly send: typeof fetch = fetch,
  ) {}

  /** Runs one Redis command. Returns undefined when Redis cannot be reached or refuses, so callers fall back to the database. */
  private async run(command: (string | number)[]): Promise<unknown> {
    try {
      const response = await this.send(this.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
        // Slower than this and the database is the faster way.
        signal: AbortSignal.timeout(1000),
      });
      const body = (await response.json()) as { result?: unknown; error?: string };
      if (!response.ok || body.error) throw new Error(body.error ?? `status ${response.status}`);
      return body.result;
    } catch (error) {
      // At most one line a minute, so an outage does not flood the log.
      if (Date.now() - this.lastWarning > 60_000) {
        this.lastWarning = Date.now();
        this.logger.warn(`Redis could not be used; reading from the database instead: ${String(error)}`);
      }
      return undefined;
    }
  }

  async get(key: string): Promise<string | null> {
    const result = await this.run(['GET', key]);
    return typeof result === 'string' ? result : null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.run(['SET', key, value, 'EX', Math.max(1, Math.floor(ttlSeconds))]);
  }

  async del(keys: string[]): Promise<void> {
    if (keys.length > 0) await this.run(['DEL', ...keys]);
  }
}

/**
 * A short-lived copy of things that are slow to fetch from the far-away
 * database. With Upstash set up it is shared and survives a restart; without it
 * it is kept in memory. Values are kept as JSON.
 */
@Injectable()
export class CacheService {
  private store: CacheStore;
  private readonly prefix: string;
  /** True when copies live in Redis, so they outlast a restart and are shared between servers. */
  shared: boolean;

  constructor(@Inject(ENV) env: Pick<Env, 'NODE_ENV' | 'UPSTASH_REDIS_REST_URL' | 'UPSTASH_REDIS_REST_TOKEN'>) {
    // Development and production may share one Redis, so their keys must never meet.
    this.prefix = `pa:${env.NODE_ENV}:`;
    if (env.NODE_ENV === 'test') {
      this.store = new OffStore();
      this.shared = false;
    } else if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      this.store = new UpstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
      this.shared = true;
    } else {
      this.store = new MemoryStore();
      this.shared = false;
    }
  }

  /** Swaps where copies are kept. For tests. */
  useStore(store: CacheStore, shared = true): this {
    this.store = store;
    this.shared = shared;
    return this;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const text = await this.store.get(this.prefix + key);
    if (text === null) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.store.set(this.prefix + key, JSON.stringify(value), ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    await this.store.del(keys.map((key) => this.prefix + key));
  }
}
