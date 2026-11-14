import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { amountSchema, daySchema, fieldError, nameSchema, noteSchema } from './common';
import { type CreateEntryInput, type EntryJson, EntriesService, type UpdateEntryInput } from './entries.service';

const idSchema = z.string('Pick one').min(1, 'Pick one');
// A fee is an amount, or 0 / null to mean "no fee".
const feeSchema = z.union([z.literal(0), amountSchema]).nullable();

const createSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('expense'),
      date: daySchema.optional(),
      amount: amountSchema,
      name: nameSchema,
      accountId: idSchema,
      categoryId: idSchema,
      note: noteSchema.optional(),
    }),
    z.object({
      kind: z.literal('income'),
      date: daySchema.optional(),
      amount: amountSchema,
      name: nameSchema,
      accountId: idSchema,
      note: noteSchema.optional(),
    }),
    z.object({
      kind: z.literal('transfer'),
      date: daySchema.optional(),
      amount: amountSchema,
      accountId: idSchema,
      toAccountId: idSchema,
      fee: feeSchema.optional(),
      note: noteSchema.optional(),
    }),
    z.object({
      kind: z.literal('correction'),
      date: daySchema.optional(),
      accountId: idSchema,
      trueBalance: z.number('Enter the balance').int('Balances are whole paisa'),
      note: noteSchema.optional(),
    }),
  ],
  'Pick what kind of entry this is',
);

const updateSchema = z.object({
  kind: z.string().optional(),
  date: daySchema.optional(),
  amount: amountSchema.optional(),
  name: nameSchema.optional(),
  accountId: idSchema.optional(),
  toAccountId: idSchema.optional(),
  categoryId: idSchema.optional(),
  fee: feeSchema.optional(),
  note: noteSchema.nullable().optional(),
  trueBalance: z.unknown().optional(),
});

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

@Controller('money/entries')
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get()
  list(
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<EntryJson[]> {
    const day = (value: string | undefined, path: string) => {
      const parsed = daySchema.safeParse(value);
      if (!parsed.success) throw fieldError(path, parsed.error.issues[0]!.message);
      return parsed.data;
    };
    const asked = Number.parseInt(limit ?? '', 10);
    const take = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;
    const range =
      date !== undefined ? { date: day(date, 'date') } : { from: day(from, 'from'), to: day(to, 'to') };
    return this.entries.list({
      ...range,
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      q: q?.trim() || undefined,
      limit: take,
    });
  }

  @Get('names')
  names(@Query('q') q?: string) {
    return this.entries.names(q?.trim() || undefined);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>): Promise<EntryJson> {
    return this.entries.create(body as CreateEntryInput);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ): Promise<EntryJson> {
    return this.entries.update(id, body as UpdateEntryInput);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.entries.remove(id);
  }
}
