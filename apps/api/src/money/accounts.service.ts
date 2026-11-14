import { Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyAccount } from '@pa/db';
import { PrismaService } from '../prisma/prisma.service';
import { assertFullOrder, fromDbDate, toDbDate } from './common';

export interface AccountJson {
  id: string;
  name: string;
  openingBalance: number;
  openingDate: string;
  sortOrder: number;
  archived: boolean;
  balance: number;
}

export interface AccountInput {
  name?: string;
  openingBalance?: number;
  openingDate?: string;
  sortOrder?: number;
  archived?: boolean;
}

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The net effect of all entries on each account, by account id. */
  async deltas(): Promise<Map<string, number>> {
    const [out, into] = await Promise.all([
      this.prisma.moneyEntry.groupBy({ by: ['accountId'], _sum: { accountDelta: true } }),
      this.prisma.moneyEntry.groupBy({
        by: ['toAccountId'],
        where: { toAccountId: { not: null } },
        _sum: { toAccountDelta: true },
      }),
    ]);
    const totals = new Map<string, number>();
    for (const row of out) totals.set(row.accountId, row._sum.accountDelta ?? 0);
    for (const row of into) {
      if (!row.toAccountId) continue;
      totals.set(row.toAccountId, (totals.get(row.toAccountId) ?? 0) + (row._sum.toAccountDelta ?? 0));
    }
    return totals;
  }

  private toJson(account: MoneyAccount, deltas: Map<string, number>): AccountJson {
    return {
      id: account.id,
      name: account.name,
      openingBalance: account.openingBalance,
      openingDate: fromDbDate(account.openingDate),
      sortOrder: account.sortOrder,
      archived: account.archivedAt !== null,
      // Never stored: always the opening balance plus what the entries did.
      balance: account.openingBalance + (deltas.get(account.id) ?? 0),
    };
  }

  async list(includeArchived = false): Promise<AccountJson[]> {
    const [accounts, deltas] = await Promise.all([
      this.prisma.moneyAccount.findMany({
        where: includeArchived ? {} : { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.deltas(),
    ]);
    return accounts.map((account) => this.toJson(account, deltas));
  }

  async get(id: string): Promise<AccountJson> {
    const account = await this.prisma.moneyAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('That account does not exist');
    return this.toJson(account, await this.deltas());
  }

  async balanceOf(id: string): Promise<number> {
    return (await this.get(id)).balance;
  }

  async create(input: Required<Pick<AccountInput, 'name' | 'openingBalance' | 'openingDate'>>): Promise<AccountJson> {
    const last = await this.prisma.moneyAccount.aggregate({ _max: { sortOrder: true } });
    const account = await this.prisma.moneyAccount.create({
      data: {
        name: input.name,
        openingBalance: input.openingBalance,
        openingDate: toDbDate(input.openingDate),
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    return this.toJson(account, new Map());
  }

  async update(id: string, input: AccountInput): Promise<AccountJson> {
    await this.get(id);
    await this.prisma.moneyAccount.update({
      where: { id },
      data: {
        name: input.name,
        openingBalance: input.openingBalance,
        openingDate: input.openingDate === undefined ? undefined : toDbDate(input.openingDate),
        sortOrder: input.sortOrder,
        archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
      },
    });
    return this.get(id);
  }

  async reorder(ids: string[]): Promise<void> {
    const existing = await this.prisma.moneyAccount.findMany({ select: { id: true } });
    assertFullOrder(ids, existing.map((account) => account.id));
    await this.prisma.$transaction(
      ids.map((id, sortOrder) => this.prisma.moneyAccount.update({ where: { id }, data: { sortOrder } })),
    );
  }
}
