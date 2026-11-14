import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { type AccountJson, AccountsService } from './accounts.service';
import { daySchema, nameSchema, reorderSchema } from './common';

// An opening balance may be negative: an overdrawn account is a real thing.
const balanceSchema = z.number('Enter a balance').int('Balances are whole paisa');

const createSchema = z.object({
  name: nameSchema,
  openingBalance: balanceSchema,
  openingDate: daySchema,
});

const updateSchema = z.object({
  name: nameSchema.optional(),
  openingBalance: balanceSchema.optional(),
  openingDate: daySchema.optional(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});

@Controller('money/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string): Promise<AccountJson[]> {
    return this.accounts.list(includeArchived === '1');
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>): Promise<AccountJson> {
    return this.accounts.create(body);
  }

  @Post('reorder')
  @HttpCode(204)
  async reorder(@Body(new ZodValidationPipe(reorderSchema)) body: z.infer<typeof reorderSchema>): Promise<void> {
    await this.accounts.reorder(body.ids);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ): Promise<AccountJson> {
    return this.accounts.update(id, body);
  }
}
