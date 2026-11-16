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
  Put,
} from '@nestjs/common';
import type { VaultField, VaultTag } from '@pa/db';
import { CATEGORY_COLORS, checkFieldValue, FIELD_TYPES, type FieldDef, type FieldType } from '@pa/shared';
import { z } from 'zod';
import { assertFullOrder, fieldError, reorderSchema } from '../money/common';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { FoldersService, ITEM_INCLUDE, type ItemJson } from './folders';

export interface TagJson {
  id: string;
  name: string;
  color: string;
  /** Items carrying it, outside the trash. */
  count: number;
}

export interface FieldJson extends FieldDef {
  sortOrder: number;
  archived: boolean;
}

const COLORS = Object.keys(CATEGORY_COLORS) as [string, ...string[]];
const tagName = z.string('Enter a name').trim().min(1, 'Enter a name').max(60, 'Use a shorter name');
const fieldName = z.string('Enter a name').trim().min(1, 'Enter a name').max(80, 'Use a shorter name');
const choicesSchema = z
  .array(z.string().trim().min(1, 'A choice cannot be empty').max(80, 'Use a shorter choice'))
  .max(100, 'Use 100 choices or fewer')
  .refine((choices) => new Set(choices).size === choices.length, 'A choice is listed twice');

const createTagSchema = z.object({ name: tagName, color: z.enum(COLORS, 'Pick a colour').optional() });
const updateTagSchema = z.object({ name: tagName.optional(), color: z.enum(COLORS, 'Pick a colour').optional() });
const itemTagsSchema = z.object({ tagIds: z.array(z.string().min(1)) });
const createFieldSchema = z
  .object({ name: fieldName, type: z.enum(FIELD_TYPES, 'Pick a type'), choices: choicesSchema.default([]) })
  .superRefine((field, ctx) => {
    if (field.type === 'choice' && field.choices.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'Give at least one choice' });
    }
  });
const updateFieldSchema = z.object({
  name: fieldName.optional(),
  choices: choicesSchema.optional(),
  archived: z.boolean().optional(),
  type: z.unknown().optional(),
});
const valueSchema = z
  .object({
    fieldId: z.string().min(1),
    folderId: z.string().min(1).optional(),
    itemId: z.string().min(1).optional(),
    value: z.unknown(),
  })
  .refine((input) => (input.folderId === undefined) !== (input.itemId === undefined), 'Give a folder or an item');

export function fieldDef(row: VaultField): FieldDef {
  return { id: row.id, name: row.name, type: row.type as FieldType, choices: row.choices };
}

function fieldJson(row: VaultField): FieldJson {
  return { ...fieldDef(row), sortOrder: row.sortOrder, archived: row.archivedAt !== null };
}

function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/** Tags and the owner's own fields, and the values given to folders and items. */
@Injectable()
export class FieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly folders: FoldersService,
  ) {}

  // Tags -------------------------------------------------------------------

  async tags(): Promise<TagJson[]> {
    const rows = await this.prisma.vaultTag.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: { where: { item: { trashedAt: null, uploaded: true } } } } } },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, color: row.color, count: row._count.items }));
  }

  private async findTag(id: string): Promise<VaultTag> {
    const row = await this.prisma.vaultTag.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That tag does not exist');
    return row;
  }

  async createTag(input: z.infer<typeof createTagSchema>): Promise<TagJson> {
    try {
      const row = await this.prisma.vaultTag.create({ data: { name: input.name, color: input.color ?? 'brass' } });
      return { id: row.id, name: row.name, color: row.color, count: 0 };
    } catch (error) {
      if (isUnique(error)) throw fieldError('name', 'There is already a tag with that name');
      throw error;
    }
  }

  async updateTag(id: string, input: z.infer<typeof updateTagSchema>): Promise<TagJson> {
    await this.findTag(id);
    try {
      await this.prisma.vaultTag.update({ where: { id }, data: input });
    } catch (error) {
      if (isUnique(error)) throw fieldError('name', 'There is already a tag with that name');
      throw error;
    }
    return (await this.tags()).find((tag) => tag.id === id)!;
  }

  /** Removes a tag from everything that carries it. */
  async deleteTag(id: string): Promise<void> {
    await this.findTag(id);
    await this.prisma.vaultTag.delete({ where: { id } });
  }

  async setItemTags(itemId: string, tagIds: string[]): Promise<ItemJson> {
    await this.folders.liveItem(itemId);
    const unique = [...new Set(tagIds)];
    if ((await this.prisma.vaultTag.count({ where: { id: { in: unique } } })) !== unique.length) {
      throw fieldError('tagIds', 'One of those tags does not exist');
    }
    await this.prisma.$transaction([
      this.prisma.vaultItemTag.deleteMany({ where: { itemId } }),
      this.prisma.vaultItemTag.createMany({ data: unique.map((tagId) => ({ itemId, tagId })) }),
    ]);
    const row = await this.prisma.vaultItem.findUniqueOrThrow({ where: { id: itemId }, include: ITEM_INCLUDE });
    return this.folders.itemJson(row, await this.folders.folderMap());
  }

  /** Everything with a tag, wherever it is filed. */
  async tagItems(id: string): Promise<{ tag: TagJson; items: ItemJson[] }> {
    await this.findTag(id);
    const rows = await this.prisma.vaultItem.findMany({
      where: { tags: { some: { tagId: id } }, trashedAt: null, uploaded: true },
      include: ITEM_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
    const map = await this.folders.folderMap();
    return { tag: (await this.tags()).find((tag) => tag.id === id)!, items: rows.map((row) => this.folders.itemJson(row, map)) };
  }

  // Fields -----------------------------------------------------------------

  async fields(includeArchived = true): Promise<FieldJson[]> {
    const rows = await this.prisma.vaultField.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(fieldJson);
  }

  async defs(): Promise<FieldDef[]> {
    return (await this.prisma.vaultField.findMany()).map(fieldDef);
  }

  private async findField(id: string): Promise<VaultField> {
    const row = await this.prisma.vaultField.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('That field does not exist');
    return row;
  }

  async createField(input: z.infer<typeof createFieldSchema>): Promise<FieldJson> {
    const last = await this.prisma.vaultField.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.vaultField.create({
      data: {
        name: input.name,
        type: input.type,
        choices: input.type === 'choice' ? input.choices : [],
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
    });
    return fieldJson(row);
  }

  async updateField(id: string, input: z.infer<typeof updateFieldSchema>): Promise<FieldJson> {
    const existing = await this.findField(id);
    if (input.type !== undefined && input.type !== existing.type) {
      throw fieldError('type', 'A field’s type cannot be changed. Make a new field instead.');
    }
    if (input.choices !== undefined && existing.type !== 'choice') throw fieldError('choices', 'Only a choice field has choices');
    if (input.choices !== undefined && input.choices.length === 0) throw fieldError('choices', 'Give at least one choice');
    const row = await this.prisma.vaultField.update({
      where: { id },
      data: {
        name: input.name,
        choices: input.choices,
        archivedAt: input.archived === undefined ? undefined : input.archived ? (existing.archivedAt ?? new Date()) : null,
      },
    });
    return fieldJson(row);
  }

  async reorderFields(ids: string[]): Promise<void> {
    const existing = await this.prisma.vaultField.findMany({ select: { id: true } });
    assertFullOrder(ids, existing.map((row) => row.id));
    await this.prisma.$transaction(ids.map((id, sortOrder) => this.prisma.vaultField.update({ where: { id }, data: { sortOrder } })));
  }

  /** Gives a folder or item a value for a field, or clears it with null. */
  async setValue(input: z.infer<typeof valueSchema>): Promise<{ fieldId: string; value: unknown }> {
    const field = await this.findField(input.fieldId);
    if (input.folderId) await this.folders.liveFolder(input.folderId);
    if (input.itemId) await this.folders.liveItem(input.itemId);
    const owner = input.folderId ? { fieldId: field.id, folderId: input.folderId } : { fieldId: field.id, itemId: input.itemId! };

    if (input.value === null || input.value === undefined) {
      await this.prisma.vaultFieldValue.deleteMany({ where: owner });
      return { fieldId: field.id, value: null };
    }
    if (field.archivedAt) throw fieldError('fieldId', 'That field is archived');
    const checked = checkFieldValue(fieldDef(field), input.value);
    if (!checked.ok) throw fieldError('value', checked.message);

    const existing = await this.prisma.vaultFieldValue.findFirst({ where: owner });
    if (existing) await this.prisma.vaultFieldValue.update({ where: { id: existing.id }, data: { value: checked.value } });
    else await this.prisma.vaultFieldValue.create({ data: { ...owner, value: checked.value } });
    return { fieldId: field.id, value: checked.value };
  }
}

@Controller('vault')
export class FieldsController {
  constructor(private readonly fields: FieldsService) {}

  @Get('tags')
  tags() {
    return this.fields.tags();
  }

  @Post('tags')
  createTag(@Body(new ZodValidationPipe(createTagSchema)) body: z.infer<typeof createTagSchema>) {
    return this.fields.createTag(body);
  }

  @Patch('tags/:id')
  updateTag(@Param('id') id: string, @Body(new ZodValidationPipe(updateTagSchema)) body: z.infer<typeof updateTagSchema>) {
    return this.fields.updateTag(id, body);
  }

  @Delete('tags/:id')
  @HttpCode(204)
  async deleteTag(@Param('id') id: string) {
    await this.fields.deleteTag(id);
  }

  @Get('tags/:id/items')
  tagItems(@Param('id') id: string) {
    return this.fields.tagItems(id);
  }

  @Put('items/:id/tags')
  setItemTags(@Param('id') id: string, @Body(new ZodValidationPipe(itemTagsSchema)) body: z.infer<typeof itemTagsSchema>) {
    return this.fields.setItemTags(id, body.tagIds);
  }

  @Get('fields')
  list() {
    return this.fields.fields();
  }

  @Post('fields')
  createField(@Body(new ZodValidationPipe(createFieldSchema)) body: z.infer<typeof createFieldSchema>) {
    return this.fields.createField(body);
  }

  // Declared before ':id' so "reorder" is not read as an id.
  @Post('fields/reorder')
  @HttpCode(204)
  async reorder(@Body(new ZodValidationPipe(reorderSchema)) body: { ids: string[] }) {
    await this.fields.reorderFields(body.ids);
  }

  @Patch('fields/:id')
  updateField(@Param('id') id: string, @Body(new ZodValidationPipe(updateFieldSchema)) body: z.infer<typeof updateFieldSchema>) {
    return this.fields.updateField(id, body);
  }

  @Put('values')
  setValue(@Body(new ZodValidationPipe(valueSchema)) body: z.infer<typeof valueSchema>) {
    if (body.folderId === undefined && body.itemId === undefined) throw new BadRequestException('Give a folder or an item');
    return this.fields.setValue(body);
  }
}
