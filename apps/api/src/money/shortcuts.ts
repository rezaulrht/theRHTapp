import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { MoneyAccount, MoneyCategory, MoneyShortcut } from '@pa/db';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { amountSchema, assertFullOrder, daySchema, fieldError, nameSchema, reorderSchema } from './common';
import { type EntryJson, EntriesService } from './entries.service';

export interface ShortcutJson {
  id: string;
  name: string;
  amount: number;
  accountId: string;
  categoryId: string;
  sortOrder: number;
  /** False when its account or category has been archived. */
  usable: boolean;
}

type ShortcutRow = MoneyShortcut & { account: MoneyAccount; category: MoneyCategory };

const idSchema = z.string('Pick one').min(1, 'Pick one');
const createSchema = z.object({ name: nameSchema, amount: amountSchema, accountId: idSchema, categoryId: idSchema });
const updateSchema = createSchema.partial();
const useSchema = z.object({ amount: amountSchema.optional(), date: daySchema.optional() });

function toJson(row: ShortcutRow): ShortcutJson {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    accountId: row.accountId,
    categoryId: row.categoryId,
    sortOrder: row.sortOrder,
    usable: row.account.archivedAt === null && row.category.archivedAt === null,
  };
}

const WITH_REFS = { account: true, category: true } as const;

/** Saved expenses the owner records with one tap. */
@Injectable()
export class ShortcutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entries: EntriesService,
  ) {}

  async list(): Promise<ShortcutJson[]> {
    const rows = await this.prisma.moneyShortcut.findMany({
      include: WITH_REFS,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toJson);
  }

  private async find(id: string): Promise<ShortcutRow> {
    const row = await this.prisma.moneyShortcut.findUnique({ where: { id }, include: WITH_REFS });
    if (!row) throw new NotFoundException('That shortcut does not exist');
    return row;
  }

  private async checkRefs(accountId?: string, categoryId?: string): Promise<void> {
    if (accountId !== undefined) {
      const account = await this.prisma.moneyAccount.findUnique({ where: { id: accountId } });
      if (!account || account.archivedAt) throw fieldError('accountId', 'Pick an account');
    }
    if (categoryId !== undefined) {
      const category = await this.prisma.moneyCategory.findUnique({ where: { id: categoryId } });
      if (!category || category.archivedAt) throw fieldError('categoryId', 'Pick a category');
    }
  }

  async create(input: z.infer<typeof createSchema>): Promise<ShortcutJson> {
    await this.checkRefs(input.accountId, input.categoryId);
    const last = await this.prisma.moneyShortcut.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.moneyShortcut.create({
      data: { ...input, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      include: WITH_REFS,
    });
    return toJson(row);
  }

  async update(id: string, input: z.infer<typeof updateSchema>): Promise<ShortcutJson> {
    await this.find(id);
    await this.checkRefs(input.accountId, input.categoryId);
    return toJson(await this.prisma.moneyShortcut.update({ where: { id }, data: input, include: WITH_REFS }));
  }

  async remove(id: string): Promise<void> {
    await this.find(id);
    await this.prisma.moneyShortcut.delete({ where: { id } });
  }

  async reorder(ids: string[]): Promise<void> {
    const existing = await this.prisma.moneyShortcut.findMany({ select: { id: true } });
    assertFullOrder(ids, existing.map((row) => row.id));
    await this.prisma.$transaction(
      ids.map((id, sortOrder) => this.prisma.moneyShortcut.update({ where: { id }, data: { sortOrder } })),
    );
  }

  /** Records the shortcut as an expense, today unless another day is given. */
  async use(id: string, input: z.infer<typeof useSchema>): Promise<EntryJson> {
    const row = await this.find(id);
    if (!toJson(row).usable) {
      throw new BadRequestException("This shortcut's account or category is archived");
    }
    return this.entries.create({
      kind: 'expense',
      date: input.date,
      amount: input.amount ?? row.amount,
      name: row.name,
      accountId: row.accountId,
      categoryId: row.categoryId,
    });
  }
}

@Controller('money/shortcuts')
export class ShortcutsController {
  constructor(private readonly shortcuts: ShortcutsService) {}

  @Get()
  list(): Promise<ShortcutJson[]> {
    return this.shortcuts.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>): Promise<ShortcutJson> {
    return this.shortcuts.create(body);
  }

  @Post('reorder')
  @HttpCode(204)
  async reorder(@Body(new ZodValidationPipe(reorderSchema)) body: z.infer<typeof reorderSchema>): Promise<void> {
    await this.shortcuts.reorder(body.ids);
  }

  @Post(':id/use')
  use(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(useSchema)) body: z.infer<typeof useSchema>,
  ): Promise<EntryJson> {
    return this.shortcuts.use(id, body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ): Promise<ShortcutJson> {
    return this.shortcuts.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.shortcuts.remove(id);
  }
}
