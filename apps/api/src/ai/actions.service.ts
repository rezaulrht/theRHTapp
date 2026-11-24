import { HttpException, Injectable } from '@nestjs/common';
import { DaysService } from '../habits/days';
import { ItemsService } from '../habits/items';
import { AccountsService } from '../money/accounts.service';
import { BudgetsService } from '../money/budgets';
import { CategoriesService } from '../money/categories.service';
import { EntriesService } from '../money/entries.service';
import { ReminderEngineService } from '../reminders/reminder-engine.service';
import type { ActionPayload, ResolveContext } from './actions';
import { SnapshotService } from './snapshots';

export interface ActionResult {
  ok: boolean;
  message: string;
}

function addDays(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Why something failed, in the words the app already uses for it. */
function reasonOf(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string') return body;
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'That did not work. Try it by hand.';
}

/**
 * Carries out actions the person has confirmed, one at a time, through the
 * same services the app's own screens use. A failure stops nothing else and is
 * reported against its own action.
 */
@Injectable()
export class ActionsService {
  constructor(
    private readonly snapshots: SnapshotService,
    private readonly items: ItemsService,
    private readonly days: DaysService,
    private readonly entries: EntriesService,
    private readonly budgets: BudgetsService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
    private readonly engine: ReminderEngineService,
  ) {}

  /** What names can be matched against right now. */
  async context(): Promise<ResolveContext> {
    const { today, timeZone, symbol } = await this.snapshots.today();
    const [habitItems, accounts, categories, entries, habitDay] = await Promise.all([
      this.items.list(),
      this.accounts.list(),
      this.categories.list(),
      this.entries.list({ from: addDays(today, -60), to: today, limit: 500 }),
      this.days.today(),
    ]);
    return {
      habitItems: habitItems.map((item) => ({ id: item.id, name: item.name })),
      accounts,
      categories: categories.filter((category) => !category.isFees),
      entries: entries
        .filter((entry) => entry.kind === 'expense')
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .map((entry) => ({ id: entry.id, name: entry.name, date: entry.date, amount: entry.amount, categoryId: entry.categoryId })),
      today,
      habitDay,
      timeZone,
      now: new Date(),
      money: (paisa) => `${symbol}${(paisa / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    };
  }

  private async one(action: ActionPayload): Promise<string> {
    const name = action.label ?? '';
    switch (action.type) {
      case 'mark_habit_done':
        await this.days.addMark(action.day, action.itemId);
        return `Marked ${name} as done`;
      case 'skip_habit':
        await this.days.skipItem(action.day, action.itemId, true);
        return `Skipped ${name} today`;
      case 'pause_habit':
        await this.items.update(action.itemId, { paused: true });
        return `Paused ${name}`;
      case 'resume_habit':
        await this.items.update(action.itemId, { paused: false });
        return `Put ${name} back on the routine`;
      case 'add_expense':
        await this.entries.create({ kind: 'expense', name: action.name, amount: action.amount, accountId: action.accountId, categoryId: action.categoryId, date: action.date });
        return `Added expense ${action.name}`;
      case 'add_income':
        await this.entries.create({ kind: 'income', name: action.name, amount: action.amount, accountId: action.accountId, date: action.date });
        return `Added income ${action.name}`;
      case 'recategorize_entry':
        await this.entries.update(action.entryId, { categoryId: action.categoryId });
        return `Changed the category of ${name}`;
      case 'set_budget':
        await this.budgets.set(action.categoryId, action.amount);
        return action.amount === 0 ? `Removed the ${name.toLowerCase()}` : `Set the ${name.toLowerCase()}`;
      case 'create_reminder':
        await this.engine.create({ ownerType: 'system', title: action.title, body: '', url: '/today', schedule: { kind: 'once', at: action.at }, channels: ['push'] });
        return `Set a reminder: ${action.title}`;
    }
  }

  async run(actions: ActionPayload[]): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    for (const action of actions) {
      try {
        results.push({ ok: true, message: await this.one(action) });
      } catch (error) {
        results.push({ ok: false, message: `${action.label ?? action.type}: ${reasonOf(error)}` });
      }
    }
    return results;
  }
}
