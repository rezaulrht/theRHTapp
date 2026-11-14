import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { MoneyEntry, Prisma } from '@pa/db';
import {
  deltasFor,
  type EntryKind,
  type LedgerEntry,
  loanDelta,
  type LoanDirection,
  monthOf,
  todayIn,
} from '@pa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AccountsService } from './accounts.service';
import { CategoriesService } from './categories.service';
import { fieldError, fromDbDate, toDbDate } from './common';

export interface EntryJson {
  id: string;
  kind: EntryKind;
  date: string;
  amount: number;
  name: string;
  note: string | null;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  personId: string | null;
  loanDirection: LoanDirection | null;
  /** Set on a fee: the transfer it belongs to. */
  feeOfId: string | null;
  /** Set on a transfer that has a fee. */
  fee: { id: string; amount: number } | null;
  createdAt: Date;
}

export type CreateEntryInput =
  | { kind: 'expense'; date?: string; amount: number; name: string; accountId: string; categoryId: string; note?: string }
  | { kind: 'income'; date?: string; amount: number; name: string; accountId: string; note?: string }
  | { kind: 'transfer'; date?: string; amount: number; accountId: string; toAccountId: string; fee?: number | null; note?: string }
  | { kind: 'correction'; date?: string; accountId: string; trueBalance: number; note?: string };

export interface UpdateEntryInput {
  kind?: string;
  date?: string;
  amount?: number;
  name?: string;
  accountId?: string;
  toAccountId?: string;
  categoryId?: string;
  /** Transfers only. 0 or null removes the fee. */
  fee?: number | null;
  note?: string | null;
  trueBalance?: unknown;
}

export interface EntryFilter {
  date?: string;
  from?: string;
  to?: string;
  accountId?: string;
  categoryId?: string;
  q?: string;
  limit?: number;
}

type EntryWithFee = MoneyEntry & { fee: MoneyEntry | null };
type Tx = Prisma.TransactionClient;

const WITH_FEE = { fee: true } as const;

function toJson(entry: EntryWithFee): EntryJson {
  return {
    id: entry.id,
    kind: entry.kind as EntryKind,
    date: fromDbDate(entry.date),
    amount: entry.amount,
    name: entry.name,
    note: entry.note,
    accountId: entry.accountId,
    toAccountId: entry.toAccountId,
    categoryId: entry.categoryId,
    personId: entry.personId,
    loanDirection: entry.loanDirection as LoanDirection | null,
    feeOfId: entry.feeOfId,
    fee: entry.fee ? { id: entry.fee.id, amount: entry.fee.amount } : null,
    createdAt: entry.createdAt,
  };
}

function cleanNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class EntriesService {
  private readonly logger = new Logger(EntriesService.name);
  private readonly spendingListeners: ((months: string[]) => Promise<void>)[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
  ) {}

  /** Registers something to run after spending in the given months changed (budget checks). */
  onSpendingChanged(listener: (months: string[]) => Promise<void>): void {
    this.spendingListeners.push(listener);
  }

  private async spendingChanged(...days: (string | undefined)[]): Promise<void> {
    const months = [...new Set(days.filter((day): day is string => Boolean(day)).map(monthOf))];
    for (const listener of this.spendingListeners) {
      try {
        await listener(months);
      } catch (error) {
        // A failed budget check must never undo or fail the entry itself.
        this.logger.error(`After-entry check failed: ${String(error)}`);
      }
    }
  }

  private async today(): Promise<string> {
    return todayIn(await this.settings.get('general.timezone'));
  }

  private async resolveDate(date: string | undefined): Promise<string> {
    const today = await this.today();
    if (date && date > today) throw fieldError('date', 'Pick today or an earlier date');
    return date ?? today;
  }

  private async activeAccount(id: string, path: string): Promise<{ id: string; name: string }> {
    const account = await this.prisma.moneyAccount.findUnique({ where: { id } });
    if (!account) throw fieldError(path, 'Pick an account');
    if (account.archivedAt) throw fieldError(path, `${account.name} is archived. Pick another account`);
    return account;
  }

  private async anyAccount(id: string): Promise<{ id: string; name: string }> {
    return this.prisma.moneyAccount.findUniqueOrThrow({ where: { id } });
  }

  private async activeCategory(id: string, path: string): Promise<void> {
    const category = await this.prisma.moneyCategory.findUnique({ where: { id } });
    if (!category) throw fieldError(path, 'Pick a category');
    if (category.archivedAt) throw fieldError(path, `${category.name} is archived. Pick another category`);
  }

  private async find(id: string): Promise<EntryWithFee> {
    const entry = await this.prisma.moneyEntry.findUnique({ where: { id }, include: WITH_FEE });
    if (!entry) throw new NotFoundException('That entry does not exist');
    return entry;
  }

  /** Creates, updates or removes the fee that belongs to a transfer. */
  private async syncFee(
    tx: Tx,
    transfer: { id: string; date: Date; accountId: string; name: string },
    existing: MoneyEntry | null,
    fee: number | null | undefined,
  ): Promise<void> {
    if (fee === undefined && !existing) return;
    if (fee === 0 || fee === null) {
      if (existing) await tx.moneyEntry.delete({ where: { id: existing.id } });
      return;
    }
    // The fee is paid from the sending account, on the transfer's day.
    const amount = fee ?? existing!.amount;
    const data = {
      date: transfer.date,
      amount,
      name: `Fee: ${transfer.name}`,
      accountId: transfer.accountId,
      accountDelta: -amount,
    };
    if (existing) {
      await tx.moneyEntry.update({ where: { id: existing.id }, data });
    } else {
      await tx.moneyEntry.create({
        data: { ...data, kind: 'expense', categoryId: await this.categories.feesCategoryId(), feeOfId: transfer.id },
      });
    }
  }

  async create(input: CreateEntryInput): Promise<EntryJson> {
    const day = await this.resolveDate(input.date);
    const date = toDbDate(day);
    const note = cleanNote(input.note);
    let id: string;

    if (input.kind === 'expense') {
      await this.activeAccount(input.accountId, 'accountId');
      await this.activeCategory(input.categoryId, 'categoryId');
      const created = await this.prisma.moneyEntry.create({
        data: {
          kind: 'expense',
          date,
          amount: input.amount,
          name: input.name,
          note,
          accountId: input.accountId,
          categoryId: input.categoryId,
          ...deltasFor('expense', input.amount),
        },
      });
      id = created.id;
    } else if (input.kind === 'income') {
      await this.activeAccount(input.accountId, 'accountId');
      const created = await this.prisma.moneyEntry.create({
        data: {
          kind: 'income',
          date,
          amount: input.amount,
          name: input.name,
          note,
          accountId: input.accountId,
          ...deltasFor('income', input.amount),
        },
      });
      id = created.id;
    } else if (input.kind === 'transfer') {
      if (input.accountId === input.toAccountId) {
        throw fieldError('toAccountId', 'Pick a different account to move money to');
      }
      const from = await this.activeAccount(input.accountId, 'accountId');
      const to = await this.activeAccount(input.toAccountId, 'toAccountId');
      const name = `${from.name} to ${to.name}`;
      id = await this.prisma.$transaction(async (tx) => {
        const transfer = await tx.moneyEntry.create({
          data: {
            kind: 'transfer',
            date,
            amount: input.amount,
            name,
            note,
            accountId: from.id,
            toAccountId: to.id,
            ...deltasFor('transfer', input.amount),
          },
        });
        await this.syncFee(tx, transfer, null, input.fee);
        return transfer.id;
      });
    } else {
      const account = await this.activeAccount(input.accountId, 'accountId');
      const delta = input.trueBalance - (await this.accounts.balanceOf(account.id));
      if (delta === 0) throw fieldError('trueBalance', 'That is already the balance');
      const created = await this.prisma.moneyEntry.create({
        data: {
          kind: 'correction',
          date,
          amount: Math.abs(delta),
          name: 'Balance correction',
          note,
          accountId: account.id,
          accountDelta: delta,
        },
      });
      id = created.id;
    }

    if (input.kind === 'expense' || input.kind === 'transfer') await this.spendingChanged(day);
    return toJson(await this.find(id));
  }

  async update(id: string, input: UpdateEntryInput): Promise<EntryJson> {
    const entry = await this.find(id);
    if (input.kind !== undefined && input.kind !== entry.kind) {
      throw fieldError('kind', 'The kind of an entry cannot be changed. Delete it and add a new one');
    }
    if (entry.feeOfId) throw new BadRequestException('Edit the transfer to change its fee');

    const oldDay = fromDbDate(entry.date);
    const day = input.date === undefined ? oldDay : await this.resolveDate(input.date);
    const date = toDbDate(day);
    const note = input.note === undefined ? entry.note : cleanNote(input.note);

    if (entry.kind === 'correction') {
      if (input.trueBalance !== undefined || input.amount !== undefined || input.accountId !== undefined) {
        throw fieldError('trueBalance', 'A correction cannot be changed. Delete it and add a new one');
      }
      await this.prisma.moneyEntry.update({ where: { id }, data: { date, note } });
      return toJson(await this.find(id));
    }

    const amount = input.amount ?? entry.amount;
    const accountId = input.accountId ?? entry.accountId;
    // Only a newly chosen account or category has to be active: an old entry
    // on something since archived must stay editable.
    if (accountId !== entry.accountId) await this.activeAccount(accountId, 'accountId');

    if (entry.kind === 'expense' || entry.kind === 'income') {
      const categoryId = entry.kind === 'expense' ? (input.categoryId ?? entry.categoryId) : null;
      if (categoryId && categoryId !== entry.categoryId) await this.activeCategory(categoryId, 'categoryId');
      await this.prisma.moneyEntry.update({
        where: { id },
        data: {
          date,
          amount,
          name: input.name ?? entry.name,
          note,
          accountId,
          categoryId,
          ...deltasFor(entry.kind, amount),
        },
      });
    } else if (entry.kind === 'transfer') {
      const toAccountId = input.toAccountId ?? entry.toAccountId!;
      if (accountId === toAccountId) {
        throw fieldError('toAccountId', 'Pick a different account to move money to');
      }
      if (toAccountId !== entry.toAccountId) await this.activeAccount(toAccountId, 'toAccountId');
      const [from, to] = await Promise.all([this.anyAccount(accountId), this.anyAccount(toAccountId)]);
      const name = `${from.name} to ${to.name}`;
      await this.prisma.$transaction(async (tx) => {
        const transfer = await tx.moneyEntry.update({
          where: { id },
          data: { date, amount, name, note, accountId, toAccountId, ...deltasFor('transfer', amount) },
        });
        await this.syncFee(tx, transfer, entry.fee, input.fee);
      });
    } else {
      // A loan: who and which direction are fixed; when, how much and which account can change.
      await this.prisma.moneyEntry.update({
        where: { id },
        data: {
          date,
          amount,
          note,
          accountId,
          accountDelta: loanDelta(entry.loanDirection as LoanDirection, amount),
        },
      });
    }

    if (entry.kind === 'expense' || entry.kind === 'transfer') await this.spendingChanged(oldDay, day);
    return toJson(await this.find(id));
  }

  async remove(id: string): Promise<void> {
    const entry = await this.find(id);
    // The database removes a transfer's fee with it (cascade).
    await this.prisma.moneyEntry.delete({ where: { id } });
    if (entry.kind === 'expense' || entry.kind === 'transfer') await this.spendingChanged(fromDbDate(entry.date));
  }

  async list(filter: EntryFilter): Promise<EntryJson[]> {
    const where: Prisma.MoneyEntryWhereInput = {};
    if (filter.date) where.date = toDbDate(filter.date);
    else where.date = { gte: toDbDate(filter.from!), lte: toDbDate(filter.to!) };
    if (filter.categoryId) where.categoryId = filter.categoryId;
    const and: Prisma.MoneyEntryWhereInput[] = [];
    // A transfer belongs to both of its accounts.
    if (filter.accountId) and.push({ OR: [{ accountId: filter.accountId }, { toAccountId: filter.accountId }] });
    if (filter.q) {
      and.push({
        OR: [
          { name: { contains: filter.q, mode: 'insensitive' } },
          { note: { contains: filter.q, mode: 'insensitive' } },
        ],
      });
    }
    if (and.length) where.AND = and;

    const entries = await this.prisma.moneyEntry.findMany({
      where,
      include: WITH_FEE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: filter.limit ?? 200,
    });
    return entries.map(toJson);
  }

  /** Names of past expenses, most recent first, each with the values it last used. */
  async names(q: string | undefined): Promise<{ name: string; accountId: string; categoryId: string | null; amount: number }[]> {
    const recent = await this.prisma.moneyEntry.findMany({
      where: {
        kind: 'expense',
        feeOfId: null,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 400,
    });
    const seen = new Set<string>();
    const names = [];
    for (const entry of recent) {
      const key = entry.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push({ name: entry.name, accountId: entry.accountId, categoryId: entry.categoryId, amount: entry.amount });
      if (names.length === 8) break;
    }
    return names;
  }

  /** Every entry in the shape the maths in @pa/shared works on. */
  async ledger(where: Prisma.MoneyEntryWhereInput = {}): Promise<LedgerEntry[]> {
    const entries = await this.prisma.moneyEntry.findMany({ where });
    return entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind as EntryKind,
      date: fromDbDate(entry.date),
      amount: entry.amount,
      accountId: entry.accountId,
      accountDelta: entry.accountDelta,
      toAccountId: entry.toAccountId,
      toAccountDelta: entry.toAccountDelta,
      categoryId: entry.categoryId,
      personId: entry.personId,
      loanDirection: entry.loanDirection as LoanDirection | null,
    }));
  }
}
