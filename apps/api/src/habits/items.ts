import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { HabitItem } from '@pa/db';
import type { AppliesTo, PrayerTimes, Timing } from '@pa/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import {
  appliesToSchema,
  assertFullOrder,
  daySchema,
  fieldError,
  multiplierSchema,
  nameSchema,
  pointsSchema,
  remindersSchema,
  reorderSchema,
  shareSchema,
  timingSchema,
  type ItemReminders,
} from './common';
import { prayerTimesFor } from './prayer-times';

export interface ItemJson {
  id: string;
  name: string;
  points: number;
  timing: Timing;
  appliesTo: AppliesTo;
  lateShare: number | null;
  missMultiplier: number | null;
  reminders: ItemReminders;
  ignoreQuietHours: boolean;
  sortOrder: number;
  paused: boolean;
  archived: boolean;
}

const createSchema = z.object({
  name: nameSchema,
  points: pointsSchema,
  timing: timingSchema,
  appliesTo: appliesToSchema,
  lateShare: shareSchema.nullable().optional(),
  missMultiplier: multiplierSchema.nullable().optional(),
  reminders: remindersSchema,
  ignoreQuietHours: z.boolean().optional(),
});
const updateSchema = createSchema.partial().extend({ paused: z.boolean().optional() });

export type CreateItemInput = z.infer<typeof createSchema>;
export type UpdateItemInput = z.infer<typeof updateSchema>;

export function itemToJson(row: HabitItem): ItemJson {
  return {
    id: row.id,
    name: row.name,
    points: row.points,
    timing: row.timing as unknown as Timing,
    appliesTo: row.appliesTo as unknown as AppliesTo,
    lateShare: row.lateShare,
    missMultiplier: row.missMultiplier,
    reminders: row.reminders as unknown as ItemReminders,
    ignoreQuietHours: row.ignoreQuietHours,
    sortOrder: row.sortOrder,
    paused: row.pausedAt !== null,
    archived: row.archivedAt !== null,
  };
}

type Listener = () => Promise<void> | void;

/** The routine: what is on it, what each thing is worth, and when it is due. */
@Injectable()
export class ItemsService {
  private readonly logger = new Logger(ItemsService.name);
  private readonly listeners: Listener[] = [];
  /** The time now. The days service shares its own clock, so both agree in tests. */
  clock: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Called after the routine changes, so today's page and reminders can follow. */
  onChanged(listener: Listener): void {
    this.listeners.push(listener);
  }

  private async changed(): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener();
      } catch (error) {
        // The item is saved; a follow-up failing must not undo or hide that.
        this.logger.error(`A habit change listener failed: ${String(error)}`);
      }
    }
  }

  async rows(includeArchived = false): Promise<HabitItem[]> {
    return this.prisma.habitItem.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async list(includeArchived = false): Promise<ItemJson[]> {
    return (await this.rows(includeArchived)).map(itemToJson);
  }

  private async find(id: string): Promise<HabitItem> {
    const row = await this.prisma.habitItem.findUnique({ where: { id } });
    if (!row || row.archivedAt) throw new NotFoundException('That item is not on the routine');
    return row;
  }

  private async checkDayTypes(appliesTo: AppliesTo | undefined): Promise<void> {
    if (appliesTo?.kind !== 'dayTypes') return;
    const known = (await this.settings.get('general.dayTypes')).map((dayType) => dayType.id);
    const unknown = appliesTo.dayTypeIds.find((id) => !known.includes(id));
    if (unknown) throw fieldError('appliesTo.dayTypeIds', `"${unknown}" is not one of your day types`);
  }

  async create(input: CreateItemInput): Promise<ItemJson> {
    await this.checkDayTypes(input.appliesTo);
    const last = await this.prisma.habitItem.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.habitItem.create({
      data: {
        name: input.name,
        points: input.points,
        timing: input.timing,
        appliesTo: input.appliesTo,
        lateShare: input.lateShare ?? null,
        missMultiplier: input.missMultiplier ?? null,
        reminders: input.reminders,
        ignoreQuietHours: input.ignoreQuietHours ?? false,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        createdAt: this.clock(),
      },
    });
    await this.changed();
    return itemToJson(row);
  }

  async update(id: string, input: UpdateItemInput): Promise<ItemJson> {
    const existing = await this.find(id);
    await this.checkDayTypes(input.appliesTo);
    const { paused, ...fields } = input;
    const row = await this.prisma.habitItem.update({
      where: { id },
      data: {
        ...fields,
        pausedAt: paused === undefined ? undefined : paused ? (existing.pausedAt ?? this.clock()) : null,
      },
    });
    await this.changed();
    return itemToJson(row);
  }

  /** Takes an item off the routine. Days it was already part of keep their copy. */
  async archive(id: string): Promise<void> {
    await this.find(id);
    await this.prisma.habitItem.update({ where: { id }, data: { archivedAt: this.clock() } });
    await this.changed();
  }

  async reorder(ids: string[]): Promise<void> {
    const existing = await this.prisma.habitItem.findMany({ where: { archivedAt: null }, select: { id: true } });
    assertFullOrder(ids, existing.map((item) => item.id));
    await this.prisma.$transaction(
      ids.map((id, sortOrder) => this.prisma.habitItem.update({ where: { id }, data: { sortOrder } })),
    );
    await this.changed();
  }
}

@Controller('habits')
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly settings: SettingsService,
  ) {}

  @Get('items')
  list(@Query('includeArchived') includeArchived?: string): Promise<ItemJson[]> {
    return this.items.list(includeArchived === '1' || includeArchived === 'true');
  }

  @Post('items')
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateItemInput): Promise<ItemJson> {
    return this.items.create(body);
  }

  // Declared before ':id' so "reorder" is not read as an id.
  @Post('items/reorder')
  @HttpCode(204)
  async reorder(@Body(new ZodValidationPipe(reorderSchema)) body: { ids: string[] }): Promise<void> {
    await this.items.reorder(body.ids);
  }

  @Patch('items/:id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateItemInput,
  ): Promise<ItemJson> {
    return this.items.update(id, body);
  }

  @Delete('items/:id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.items.archive(id);
  }

  @Get('prayer-times')
  async prayerTimes(@Query('day') day?: string): Promise<{ day: string } & PrayerTimes> {
    const parsed = daySchema.safeParse(day);
    if (!parsed.success) throw fieldError('day', parsed.error.issues[0]!.message);
    return { day: parsed.data, ...prayerTimesFor(parsed.data, await this.settings.getAll()) };
  }
}
