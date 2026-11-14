import { Body, Controller, Get, HttpCode, Injectable, Put } from '@nestjs/common';
import { MAX_AMOUNT } from '@pa/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { fieldError } from './common';

export interface BudgetJson {
  /** Null is the budget for the whole month. */
  categoryId: string | null;
  amount: number;
}

const putSchema = z.object({
  categoryId: z.string().min(1).nullable(),
  // 0 clears the budget.
  amount: z.number('Enter an amount').int('Amounts are whole paisa').min(0, 'Enter zero or more').max(MAX_AMOUNT),
});

/** Monthly spending limits: one per category, and one for the month as a whole. */
@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<BudgetJson[]> {
    const rows = await this.prisma.moneyBudget.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((row) => ({ categoryId: row.categoryId, amount: row.amount }));
  }

  async set(categoryId: string | null, amount: number): Promise<void> {
    if (categoryId !== null) {
      const category = await this.prisma.moneyCategory.findUnique({ where: { id: categoryId } });
      if (!category) throw fieldError('categoryId', 'Pick a category');
    }
    // The whole-month budget has no category, and a unique index does not
    // treat two nulls as the same, so it is found by hand, not upserted.
    const existing = await this.prisma.moneyBudget.findFirst({ where: { categoryId } });
    if (amount === 0) {
      if (existing) await this.prisma.moneyBudget.delete({ where: { id: existing.id } });
    } else if (existing) {
      await this.prisma.moneyBudget.update({ where: { id: existing.id }, data: { amount } });
    } else {
      await this.prisma.moneyBudget.create({ data: { categoryId, amount } });
    }
  }
}

@Controller('money/budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(): Promise<BudgetJson[]> {
    return this.budgets.list();
  }

  @Put()
  @HttpCode(204)
  async set(@Body(new ZodValidationPipe(putSchema)) body: z.infer<typeof putSchema>): Promise<void> {
    await this.budgets.set(body.categoryId, body.amount);
  }
}
