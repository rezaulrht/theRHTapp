import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  type OnModuleInit,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Reminder, VaultTodo } from '@pa/db';
import { channelSchema, fieldValueText, nextOccurrence, scheduleSchema, todayIn, type Channel, type Schedule } from '@pa/shared';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { daySchema, fieldError, fromDbDate, toDbDate } from '../money/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReminderEngineService } from '../reminders/reminder-engine.service';
import type { ReminderGate } from '../reminders/reminder-gate';
import { SettingsService } from '../settings/settings.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { FoldersService, todoToJson, type FolderJson, type ItemJson, type TodoJson } from './folders';

export interface VaultReminderJson {
  id: string;
  owner: string;
  title: string;
  body: string;
  schedule: Schedule;
  channels: Channel[];
  ignoreQuietHours: boolean;
  /** When it next goes off; null when it will not again. */
  next: string | null;
}

export interface CalendarEntry {
  date: string;
  kind: 'reminder' | 'todo' | 'field';
  title: string;
  /** The exact time, for a reminder. */
  at: string | null;
  done: boolean;
  link: string;
}

/** A to-do's reminder goes off at this hour on its due date. */
export const TODO_REMINDER_HOUR = 9;
const MAX_CALENDAR_DAYS = 92;
const MAX_OCCURRENCES = 400;

const todoText = z.string('Write the to-do').trim().min(1, 'Write the to-do').max(500, 'Use shorter text');
const createTodoSchema = z.object({ text: todoText, dueDate: daySchema.nullable().optional(), remind: z.boolean().optional() });
const updateTodoSchema = z.object({
  text: todoText.optional(),
  dueDate: daySchema.nullable().optional(),
  remind: z.boolean().optional(),
  done: z.boolean().optional(),
});
const ownerSchema = z.string().regex(/^(folder|item):[^:]+$/, 'Say which folder or item');
const title = z.string('Give it a title').trim().min(1, 'Give it a title').max(200, 'Use a shorter title');
const createReminderSchema = z.object({
  owner: ownerSchema,
  title,
  body: z.string().trim().max(1000).optional(),
  schedule: scheduleSchema,
  channels: z.array(channelSchema),
  ignoreQuietHours: z.boolean().optional(),
});
const updateReminderSchema = z.object({
  title: title.optional(),
  body: z.string().trim().max(1000).optional(),
  schedule: scheduleSchema.optional(),
  channels: z.array(channelSchema).optional(),
  ignoreQuietHours: z.boolean().optional(),
});

function linkFor(owner: string, folderOfTodo?: string): string {
  const [kind, id] = owner.split(':');
  if (kind === 'folder') return `/vault/f/${id}`;
  if (kind === 'item') return `/vault/i/${id}`;
  return `/vault/f/${folderOfTodo ?? ''}`;
}

function addDays(day: string, days: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** To-dos, reminders and the calendar that brings them together with date fields. */
@Injectable()
export class PlannerService implements OnModuleInit, ReminderGate {
  readonly ownerType = 'vault';

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly engine: ReminderEngineService,
    private readonly folders: FoldersService,
  ) {}

  onModuleInit(): void {
    this.engine.registerGate(this);
  }

  // To-dos -----------------------------------------------------------------

  private async findTodo(id: string): Promise<VaultTodo> {
    const row = await this.prisma.vaultTodo.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That to-do does not exist');
    await this.folders.liveFolder(row.folderId);
    return row;
  }

  /** Keeps a to-do's reminder in step with it: there while it is due, wanted and not done. */
  private async syncTodoReminder(todo: VaultTodo): Promise<void> {
    await this.engine.removeForOwner('vault', `todo:${todo.id}`);
    if (!todo.remind || !todo.dueDate || todo.doneAt) return;
    const timeZone = await this.settings.get('general.timezone');
    const at = DateTime.fromISO(fromDbDate(todo.dueDate), { zone: timeZone }).set({ hour: TODO_REMINDER_HOUR }).toJSDate();
    if (at.getTime() <= this.folders.clock().getTime()) return;
    await this.engine.create(
      {
        ownerType: 'vault',
        ownerId: `todo:${todo.id}`,
        title: `To do: ${todo.text}`,
        body: 'Due today.',
        url: `/vault/f/${todo.folderId}`,
        schedule: { kind: 'once', at: at.toISOString() },
        channels: ['push'],
      },
      this.folders.clock(),
    );
  }

  async createTodo(folderId: string, input: z.infer<typeof createTodoSchema>): Promise<TodoJson> {
    await this.folders.liveFolder(folderId);
    const last = await this.prisma.vaultTodo.aggregate({ where: { folderId }, _max: { sortOrder: true } });
    const row = await this.prisma.vaultTodo.create({
      data: {
        folderId,
        text: input.text,
        dueDate: input.dueDate ? toDbDate(input.dueDate) : null,
        remind: input.remind ?? false,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    await this.syncTodoReminder(row);
    return todoToJson(row);
  }

  async updateTodo(id: string, input: z.infer<typeof updateTodoSchema>): Promise<TodoJson> {
    const existing = await this.findTodo(id);
    const row = await this.prisma.vaultTodo.update({
      where: { id },
      data: {
        text: input.text,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate === null ? null : toDbDate(input.dueDate),
        remind: input.remind,
        doneAt: input.done === undefined ? undefined : input.done ? (existing.doneAt ?? this.folders.clock()) : null,
      },
    });
    await this.syncTodoReminder(row);
    return todoToJson(row);
  }

  async deleteTodo(id: string): Promise<void> {
    await this.findTodo(id);
    await this.engine.removeForOwner('vault', `todo:${id}`);
    await this.prisma.vaultTodo.delete({ where: { id } });
  }

  // Reminders on folders and items ----------------------------------------------

  private async checkOwner(owner: string): Promise<void> {
    const [kind, id = ''] = owner.split(':');
    if (kind === 'folder') await this.folders.liveFolder(id);
    else await this.folders.liveItem(id);
  }

  private reminderJson(row: Reminder): VaultReminderJson {
    return {
      id: row.id,
      owner: row.ownerId ?? '',
      title: row.title,
      body: row.body,
      schedule: row.schedule as unknown as Schedule,
      channels: row.channels as Channel[],
      ignoreQuietHours: row.ignoreQuietHours,
      next: row.nextFireAt?.toISOString() ?? null,
    };
  }

  private async findReminder(id: string): Promise<Reminder> {
    const row = await this.prisma.reminder.findUnique({ where: { id } });
    if (!row || row.ownerType !== 'vault' || !row.ownerId || row.ownerId.startsWith('todo:')) {
      throw new NotFoundException('That reminder does not exist');
    }
    return row;
  }

  async reminders(owner: string): Promise<VaultReminderJson[]> {
    if (!ownerSchema.safeParse(owner).success) throw fieldError('owner', 'Say which folder or item');
    await this.checkOwner(owner);
    const rows = await this.prisma.reminder.findMany({ where: { ownerType: 'vault', ownerId: owner }, orderBy: { createdAt: 'asc' } });
    return rows.map((row) => this.reminderJson(row));
  }

  async createReminder(input: z.infer<typeof createReminderSchema>): Promise<VaultReminderJson> {
    await this.checkOwner(input.owner);
    const row = await this.engine.create(
      {
        ownerType: 'vault',
        ownerId: input.owner,
        title: input.title,
        body: input.body ?? '',
        url: linkFor(input.owner),
        schedule: input.schedule,
        channels: input.channels,
        ignoreQuietHours: input.ignoreQuietHours ?? false,
      },
      this.folders.clock(),
    );
    return this.reminderJson(row);
  }

  async updateReminder(id: string, input: z.infer<typeof updateReminderSchema>): Promise<VaultReminderJson> {
    await this.findReminder(id);
    return this.reminderJson(await this.engine.update(id, input, this.folders.clock()));
  }

  async deleteReminder(id: string): Promise<void> {
    await this.findReminder(id);
    await this.engine.remove(id);
  }

  /** Nothing goes off for something in the trash, or a to-do already done. */
  async shouldSend(reminder: Reminder): Promise<boolean> {
    const [kind, id = ''] = (reminder.ownerId ?? '').split(':');
    if (kind === 'folder') {
      const row = await this.prisma.vaultFolder.findUnique({ where: { id } });
      return row !== null && row.trashedAt === null;
    }
    if (kind === 'item') {
      const row = await this.prisma.vaultItem.findUnique({ where: { id } });
      return row !== null && row.trashedAt === null;
    }
    if (kind === 'todo') {
      const row = await this.prisma.vaultTodo.findUnique({ where: { id }, include: { folder: true } });
      return row !== null && row.doneAt === null && row.folder.trashedAt === null;
    }
    return true;
  }

  // Calendar ---------------------------------------------------------------

  /** Every reminder, to-do due date and date field value between two days, in date order. */
  async calendar(from: string, to: string): Promise<CalendarEntry[]> {
    const timeZone = await this.settings.get('general.timezone');
    const start = DateTime.fromISO(from, { zone: timeZone }).startOf('day').toJSDate();
    const end = DateTime.fromISO(to, { zone: timeZone }).endOf('day').toJSDate();
    const [liveFolders, liveItems] = await Promise.all([
      this.prisma.vaultFolder.findMany({ where: { trashedAt: null }, select: { id: true, name: true } }),
      this.prisma.vaultItem.findMany({ where: { trashedAt: null, uploaded: true }, select: { id: true, name: true } }),
    ]);
    const folderName = new Map(liveFolders.map((row) => [row.id, row.name]));
    const itemName = new Map(liveItems.map((row) => [row.id, row.name]));
    const ownerLive = (owner: string) => {
      const [kind, id = ''] = owner.split(':');
      return kind === 'folder' ? folderName.has(id) : itemName.has(id);
    };
    const entries: CalendarEntry[] = [];

    const reminders = await this.prisma.reminder.findMany({ where: { ownerType: 'vault', enabled: true } });
    for (const reminder of reminders) {
      const owner = reminder.ownerId ?? '';
      // To-dos appear as themselves, below.
      if (owner.startsWith('todo:') || !ownerLive(owner)) continue;
      const parsed = scheduleSchema.safeParse(reminder.schedule);
      if (!parsed.success) continue;
      let cursor: Date | null = new Date(start.getTime() - 1);
      for (let count = 0; count < MAX_OCCURRENCES; count++) {
        cursor = nextOccurrence(parsed.data, cursor, timeZone);
        if (!cursor || cursor.getTime() > end.getTime()) break;
        entries.push({
          date: todayIn(timeZone, cursor),
          kind: 'reminder',
          title: reminder.title,
          at: cursor.toISOString(),
          done: false,
          link: linkFor(owner),
        });
      }
    }

    const todos = await this.prisma.vaultTodo.findMany({
      where: { dueDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    });
    for (const todo of todos) {
      if (!folderName.has(todo.folderId)) continue;
      entries.push({
        date: fromDbDate(todo.dueDate!),
        kind: 'todo',
        title: todo.text,
        at: null,
        done: todo.doneAt !== null,
        link: `/vault/f/${todo.folderId}`,
      });
    }

    const dateFields = await this.prisma.vaultField.findMany({ where: { type: 'date' }, include: { values: true } });
    for (const field of dateFields) {
      for (const value of field.values) {
        const date = fieldValueText(undefined, value.value);
        if (date < from || date > to) continue;
        const owner = value.folderId ? `folder:${value.folderId}` : `item:${value.itemId}`;
        if (!ownerLive(owner)) continue;
        const name = value.folderId ? folderName.get(value.folderId) : itemName.get(value.itemId!);
        entries.push({ date, kind: 'field', title: `${field.name}: ${name}`, at: null, done: false, link: linkFor(owner) });
      }
    }

    return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.at ?? '').localeCompare(b.at ?? '') || a.title.localeCompare(b.title));
  }

  /** The Vault's block on the Today page: pins and what is coming in the next week. */
  async today(): Promise<{ pinned: { folders: FolderJson[]; items: ItemJson[] }; upcoming: CalendarEntry[] }> {
    const timeZone = await this.settings.get('general.timezone');
    const today = todayIn(timeZone, this.folders.clock());
    const home = await this.folders.home();
    const upcoming = (await this.calendar(today, addDays(today, 6)))
      .filter((entry) => !entry.done && (entry.at === null || entry.at >= this.folders.clock().toISOString()))
      .slice(0, 5);
    return { pinned: home.pinned, upcoming };
  }
}

@Controller('vault')
export class PlannerController {
  constructor(private readonly planner: PlannerService) {}

  @Post('folders/:id/todos')
  createTodo(@Param('id') id: string, @Body(new ZodValidationPipe(createTodoSchema)) body: z.infer<typeof createTodoSchema>) {
    return this.planner.createTodo(id, body);
  }

  @Patch('todos/:id')
  updateTodo(@Param('id') id: string, @Body(new ZodValidationPipe(updateTodoSchema)) body: z.infer<typeof updateTodoSchema>) {
    return this.planner.updateTodo(id, body);
  }

  @Delete('todos/:id')
  @HttpCode(204)
  async deleteTodo(@Param('id') id: string) {
    await this.planner.deleteTodo(id);
  }

  @Get('reminders')
  reminders(@Query('owner') owner?: string) {
    return this.planner.reminders(owner ?? '');
  }

  @Post('reminders')
  createReminder(@Body(new ZodValidationPipe(createReminderSchema)) body: z.infer<typeof createReminderSchema>) {
    return this.planner.createReminder(body);
  }

  @Patch('reminders/:id')
  updateReminder(@Param('id') id: string, @Body(new ZodValidationPipe(updateReminderSchema)) body: z.infer<typeof updateReminderSchema>) {
    return this.planner.updateReminder(id, body);
  }

  @Delete('reminders/:id')
  @HttpCode(204)
  async deleteReminder(@Param('id') id: string) {
    await this.planner.deleteReminder(id);
  }

  @Get('calendar')
  calendar(@Query('from') from?: string, @Query('to') to?: string) {
    const day = (value: string | undefined, path: string) => {
      const parsed = daySchema.safeParse(value);
      if (!parsed.success) throw fieldError(path, parsed.error.issues[0]!.message);
      return parsed.data;
    };
    const start = day(from, 'from');
    const end = day(to, 'to');
    if (end < start) throw fieldError('to', 'The end must not be before the start');
    if ((toDbDate(end).getTime() - toDbDate(start).getTime()) / 86_400_000 + 1 > MAX_CALENDAR_DAYS) {
      throw new BadRequestException('Ask for three months or less at a time');
    }
    return this.planner.calendar(start, end);
  }

  @Get('today')
  today() {
    return this.planner.today();
  }
}
