import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@pa/db';
import { ENV, type Env } from '../env';
import { PrismaService } from '../prisma/prisma.service';
import { isSealed, seal, secretOf, unseal } from './secret-box';

/** The settings table row that holds the key. It is not one of the settings the app lists, so it is never sent to the browser. */
const ROW = 'secret.deepseek';
const KEEP_MS = 5 * 60_000;

export interface KeyStatus {
  enabled: boolean;
  /** Where the key in use comes from; the one saved in Settings wins over the server's environment. */
  source: 'settings' | 'env' | null;
  /** The last four characters of a saved key, so it can be told apart. Never the key itself. */
  hint: string | null;
}

/** Keeps the assistant's API key: saved from Settings, encrypted, and read back only on the server. */
@Injectable()
export class AiKeyService {
  private kept: { value: { key: string; hint: string } | null; at: number } | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** What encrypts the key. Set SECRETS_KEY to keep a saved key working if the database address ever changes. */
  private get secret(): string {
    return secretOf(this.env);
  }

  /** The saved key, read from the database at most once every few minutes. */
  private async saved(): Promise<{ key: string; hint: string } | null> {
    // Tests empty the table behind the app's back, so nothing is kept there.
    const keep = this.env.NODE_ENV !== 'test';
    if (keep && this.kept && Date.now() - this.kept.at < KEEP_MS) return this.kept.value;

    const row = await this.prisma.setting.findUnique({ where: { key: ROW } });
    let value: { key: string; hint: string } | null = null;
    if (row && isSealed(row.value)) {
      const key = unseal(row.value, this.secret);
      if (key) value = { key, hint: key.slice(-4) };
    }
    if (keep) this.kept = { value, at: Date.now() };
    return value;
  }

  /** The key to use: the saved one, else the one in the environment. */
  async get(): Promise<string | undefined> {
    return (await this.saved())?.key ?? this.env.DEEPSEEK_API_KEY;
  }

  async status(): Promise<KeyStatus> {
    const saved = await this.saved();
    if (saved) return { enabled: true, source: 'settings', hint: saved.hint };
    if (this.env.DEEPSEEK_API_KEY) return { enabled: true, source: 'env', hint: null };
    return { enabled: false, source: null, hint: null };
  }

  async set(key: string): Promise<void> {
    const value = seal(key, this.secret) as unknown as Prisma.InputJsonValue;
    await this.prisma.setting.upsert({ where: { key: ROW }, create: { key: ROW, value }, update: { value } });
    this.kept = undefined;
  }

  async remove(): Promise<void> {
    await this.prisma.setting.deleteMany({ where: { key: ROW } });
    this.kept = undefined;
  }
}
