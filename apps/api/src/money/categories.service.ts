import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MoneyCategory } from '@pa/db';
import { PrismaService } from '../prisma/prisma.service';
import { assertFullOrder, fieldError } from './common';

export interface CategoryJson {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
  isFees: boolean;
  archived: boolean;
}

export interface CategoryInput {
  name?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  archived?: boolean;
}

const FEES_KEPT = 'The Fees category is used for transfer fees and cannot be removed';

function toJson(category: MoneyCategory): CategoryJson {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    icon: category.icon,
    sortOrder: category.sortOrder,
    isFees: category.isFees,
    archived: category.archivedAt !== null,
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeArchived = false): Promise<CategoryJson[]> {
    const categories = await this.prisma.moneyCategory.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return categories.map(toJson);
  }

  private async find(id: string): Promise<MoneyCategory> {
    const category = await this.prisma.moneyCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('That category does not exist');
    return category;
  }

  /** The category transfer fees are filed under. Created on demand if the owner has none. */
  async feesCategoryId(): Promise<string> {
    const existing = await this.prisma.moneyCategory.findFirst({ where: { isFees: true } });
    if (existing) return existing.id;
    const created = await this.create({ name: 'Fees', color: 'sage', icon: 'fee' }, true);
    return created.id;
  }

  async create(
    input: Required<Pick<CategoryInput, 'name' | 'color' | 'icon'>>,
    isFees = false,
  ): Promise<CategoryJson> {
    const last = await this.prisma.moneyCategory.aggregate({ _max: { sortOrder: true } });
    const category = await this.prisma.moneyCategory.create({
      data: { ...input, isFees, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return toJson(category);
  }

  async update(id: string, input: CategoryInput): Promise<CategoryJson> {
    const category = await this.find(id);
    if (category.isFees && input.archived) throw new BadRequestException(FEES_KEPT);
    const updated = await this.prisma.moneyCategory.update({
      where: { id },
      data: {
        name: input.name,
        color: input.color,
        icon: input.icon,
        sortOrder: input.sortOrder,
        archivedAt: input.archived === undefined ? undefined : input.archived ? new Date() : null,
      },
    });
    return toJson(updated);
  }

  async reorder(ids: string[]): Promise<void> {
    const existing = await this.prisma.moneyCategory.findMany({ select: { id: true } });
    assertFullOrder(ids, existing.map((category) => category.id));
    await this.prisma.$transaction(
      ids.map((id, sortOrder) => this.prisma.moneyCategory.update({ where: { id }, data: { sortOrder } })),
    );
  }

  /** Moves everything filed under `id` to `intoId`, then archives `id`. */
  async merge(id: string, intoId: string): Promise<void> {
    const source = await this.find(id);
    if (source.isFees) throw new BadRequestException(FEES_KEPT);
    if (id === intoId) throw fieldError('intoId', 'Pick a different category to merge into');
    await this.find(intoId);

    await this.prisma.$transaction(async (tx) => {
      await tx.moneyEntry.updateMany({ where: { categoryId: id }, data: { categoryId: intoId } });
      await tx.moneyShortcut.updateMany({ where: { categoryId: id }, data: { categoryId: intoId } });
      // A category has at most one budget. If the target already has one, it wins.
      const targetBudget = await tx.moneyBudget.findUnique({ where: { categoryId: intoId } });
      if (targetBudget) {
        await tx.moneyBudget.deleteMany({ where: { categoryId: id } });
      } else {
        await tx.moneyBudget.updateMany({ where: { categoryId: id }, data: { categoryId: intoId } });
      }
      await tx.moneyCategory.update({ where: { id }, data: { archivedAt: new Date() } });
    });
  }
}
