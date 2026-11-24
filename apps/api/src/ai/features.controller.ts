import { Body, Controller, Get, HttpCode, Post, UnprocessableEntityException } from '@nestjs/common';
import { z } from 'zod';
import { daySchema } from '../habits/common';
import { ReminderEngineService } from '../reminders/reminder-engine.service';
import { AccountsService } from '../money/accounts.service';
import { CategoriesService } from '../money/categories.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { AiService } from './ai.service';
import type { ParsedExpense } from './expense-parser';
import {
  answerMessages,
  bulkMessages,
  budgetMessages,
  categoryMessages,
  coachMessages,
  daySummaryMessages,
  localToInstant,
  type ProposedItem,
  readBulk,
  readCategory,
  readIntent,
  readRoutine,
  routerMessages,
  routineMessages,
} from './prompts';
import { SnapshotService } from './snapshots';
import { WeeklyReviewService } from './weekly-review.service';
import { DateTime } from 'luxon';

const text = (max: number) => z.string().trim().min(1, 'Type something first').max(max, 'That is too long');

const nameSchema = z.object({ name: text(120) });
const textSchema = z.object({ text: text(600) });
const askSchema = z.object({ text: text(600), scope: z.enum(['money', 'habits', 'all']).optional() });
const daySummarySchema = z.object({ day: daySchema.optional() });
const routineSchema = z.object({ description: text(800) });
const reminderSchema = z.object({ title: text(200), at: z.iso.datetime({ offset: true }) });

export type AskAnswer =
  | { type: 'answer'; text: string }
  | { type: 'expense'; items: ParsedExpense[] }
  | { type: 'reminder'; title: string; at: string; whenText: string };

/** What the assistant can do. Every endpoint only reads and suggests, except creating a reminder the person just confirmed. */
@Controller('ai')
export class AiFeaturesController {
  constructor(
    private readonly ai: AiService,
    private readonly snapshots: SnapshotService,
    private readonly accounts: AccountsService,
    private readonly categories: CategoriesService,
    private readonly engine: ReminderEngineService,
    private readonly weekly: WeeklyReviewService,
  ) {}

  private async lists() {
    const [accounts, categories] = await Promise.all([this.accounts.list(), this.categories.list()]);
    return { accounts, categories: categories.filter((category) => !category.isFees) };
  }

  /** The category for a name the person's own history did not know. Cheap: a few tokens. */
  @Post('suggest-category')
  @HttpCode(200)
  async suggestCategory(@Body(new ZodValidationPipe(nameSchema)) body: z.infer<typeof nameSchema>): Promise<{ categoryId: string | null }> {
    const { categories } = await this.lists();
    const reply = await this.ai.json(categoryMessages(body.name, categories.map((category) => category.name)), { maxTokens: 40 });
    return { categoryId: readCategory(reply, categories) };
  }

  /** Several expenses from a pasted list, for the person to check. Nothing is saved. */
  @Post('parse-expenses')
  @HttpCode(200)
  async parseExpenses(@Body(new ZodValidationPipe(textSchema)) body: z.infer<typeof textSchema>): Promise<{ items: ParsedExpense[] }> {
    const { today } = await this.snapshots.today();
    const { accounts, categories } = await this.lists();
    const reply = await this.ai.json(
      bulkMessages(body.text, accounts.map((a) => a.name), categories.map((c) => c.name), today),
      { maxTokens: 900 },
    );
    const items = readBulk(reply, accounts, categories, today);
    if (items.length === 0) throw new UnprocessableEntityException('Could not find any amounts in that. Try one per line, like "Lunch 250".');
    return { items };
  }

  @Get('budget-advice')
  async budgetAdvice(): Promise<{ text: string }> {
    const budget = await this.snapshots.budget();
    if (!budget) return { text: 'No budgets are set yet. Set one for a category or for the whole month in Money, and the pace can be checked here.' };
    const { today } = await this.snapshots.today();
    return { text: await this.ai.text(budgetMessages(budget.context, today), { maxTokens: 350 }) };
  }

  /** One box for everything: a question, a list of expenses, or a reminder. It says which it understood. */
  @Post('ask')
  @HttpCode(200)
  async ask(@Body(new ZodValidationPipe(askSchema)) body: z.infer<typeof askSchema>): Promise<AskAnswer> {
    const { today, timeZone, symbol } = await this.snapshots.today();
    const now = new Date();
    const nowLocal = DateTime.fromJSDate(now, { zone: timeZone }).toFormat("yyyy-MM-dd'T'HH:mm (cccc)");
    // A page that is only about money or only about habits asks only what it can answer.
    const scope = body.scope ?? 'all';
    const intent = scope === 'all' ? readIntent(await this.ai.json(routerMessages(body.text, nowLocal, timeZone), { maxTokens: 100 })) : { type: 'question' as const };

    if (intent.type === 'reminder') {
      const at = localToInstant(intent.when, timeZone, now);
      if (at) {
        const whenText = DateTime.fromISO(at, { zone: timeZone }).toFormat('cccc d LLLL, h:mm a');
        return { type: 'reminder', title: intent.title, at, whenText };
      }
      return { type: 'answer', text: 'I could not work out when. Try "remind me to pay rent on 5 December at 9am".' };
    }

    if (intent.type === 'expense') {
      const { accounts, categories } = await this.lists();
      const reply = await this.ai.json(bulkMessages(body.text, accounts.map((a) => a.name), categories.map((c) => c.name), today), { maxTokens: 900 });
      const items = readBulk(reply, accounts, categories, today);
      if (items.length > 0) return { type: 'expense', items };
    }

    const parts: string[] = [];
    if (scope !== 'habits') parts.push(`MONEY\n${await this.snapshots.money()}`);
    if (scope !== 'money') parts.push(`HABITS\n${await this.snapshots.habits()}`);
    return { type: 'answer', text: await this.ai.text(answerMessages(body.text, parts.join('\n\n'), today, symbol), { maxTokens: 400 }) };
  }

  /** Creates the reminder the person just confirmed from the ask box. */
  @Post('create-reminder')
  @HttpCode(201)
  async createReminder(@Body(new ZodValidationPipe(reminderSchema)) body: z.infer<typeof reminderSchema>): Promise<{ id: string }> {
    const reminder = await this.engine.create({
      ownerType: 'system',
      title: body.title,
      body: '',
      url: '/today',
      schedule: { kind: 'once', at: body.at },
      channels: ['push'],
    });
    return { id: reminder.id };
  }

  /** Writes and sends the weekly review now, so it can be tried without waiting for the day. */
  @Post('weekly-review/now')
  @HttpCode(200)
  async weeklyNow(): Promise<{ text: string }> {
    return { text: await this.weekly.sendNow() };
  }

  @Post('habit-coach')
  @HttpCode(200)
  async habitCoach(): Promise<{ text: string }> {
    const { today } = await this.snapshots.today();
    const { context, days } = await this.snapshots.coach();
    if (days < 5) return { text: 'There are not enough finished days yet to see a pattern. Come back after a week of ticking things off.' };
    return { text: await this.ai.text(coachMessages(context, today), { maxTokens: 450 }) };
  }

  @Post('day-summary')
  @HttpCode(200)
  async daySummary(@Body(new ZodValidationPipe(daySummarySchema)) body: z.infer<typeof daySummarySchema>): Promise<{ text: string }> {
    const { context } = await this.snapshots.dayOfHabits(body.day);
    return { text: await this.ai.text(daySummaryMessages(context), { maxTokens: 300 }) };
  }

  /** A routine drawn from a description of an ideal day. Nothing is added until the person picks. */
  @Post('routine')
  @HttpCode(200)
  async routine(@Body(new ZodValidationPipe(routineSchema)) body: z.infer<typeof routineSchema>): Promise<{ items: ProposedItem[] }> {
    const items = readRoutine(await this.ai.json(routineMessages(body.description), { maxTokens: 1500 }));
    if (items.length === 0) throw new UnprocessableEntityException('Could not turn that into habits. Describe a few things with times, like "gym at 7am, read 20 minutes at night".');
    return { items };
  }
}
