import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@pa/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../zod-validation.pipe';
import { type CategoryJson, CategoriesService } from './categories.service';
import { nameSchema, reorderSchema } from './common';

const colorSchema = z.enum(Object.keys(CATEGORY_COLORS) as [string, ...string[]], 'Pick one of the colours');
const iconSchema = z.enum(CATEGORY_ICONS, 'Pick one of the icons');

const createSchema = z.object({ name: nameSchema, color: colorSchema, icon: iconSchema });

const updateSchema = z.object({
  name: nameSchema.optional(),
  color: colorSchema.optional(),
  icon: iconSchema.optional(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
});

const mergeSchema = z.object({ intoId: z.string().min(1) });

@Controller('money/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query('includeArchived') includeArchived?: string): Promise<CategoryJson[]> {
    return this.categories.list(includeArchived === '1');
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>): Promise<CategoryJson> {
    return this.categories.create(body);
  }

  @Post('reorder')
  @HttpCode(204)
  async reorder(@Body(new ZodValidationPipe(reorderSchema)) body: z.infer<typeof reorderSchema>): Promise<void> {
    await this.categories.reorder(body.ids);
  }

  @Post(':id/merge')
  @HttpCode(204)
  async merge(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(mergeSchema)) body: z.infer<typeof mergeSchema>,
  ): Promise<void> {
    await this.categories.merge(id, body.intoId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>,
  ): Promise<CategoryJson> {
    return this.categories.update(id, body);
  }
}
