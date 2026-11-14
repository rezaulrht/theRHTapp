import { BadRequestException } from '@nestjs/common';
import { MAX_AMOUNT } from '@pa/shared';
import { z } from 'zod';

/** A calendar day, 'YYYY-MM-DD', that really exists (no 30 February). */
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-13')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'That date does not exist');

/** A positive amount in whole paisa. */
export const amountSchema = z
  .number('Enter an amount')
  .int('Amounts are whole paisa')
  .min(1, 'Enter an amount above zero')
  .max(MAX_AMOUNT, 'That amount is too large');

export const nameSchema = z.string().trim().min(1, 'Enter a name').max(120, 'Use a shorter name');
export const noteSchema = z.string().trim().max(500, 'Use a shorter note');

/** Calendar day to the value Prisma stores in a DATE column. */
export function toDbDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** A DATE column value back to 'YYYY-MM-DD'. */
export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A 400 that names the field at fault, in the same shape Zod failures use. */
export function fieldError(path: string, message: string): BadRequestException {
  return new BadRequestException({ message: 'Some fields are not valid', errors: [{ path, message }] });
}

export const reorderSchema = z.object({ ids: z.array(z.string().min(1)) });

/** Checks a reorder request names every existing id exactly once. */
export function assertFullOrder(ids: string[], existing: string[]): void {
  const same = ids.length === existing.length && new Set(ids).size === ids.length && existing.every((id) => ids.includes(id));
  if (!same) throw fieldError('ids', 'List every item exactly once');
}
