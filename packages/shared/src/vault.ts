// Pure Vault maths: custom field values, filtering and sorting by them, and
// the check that stops a folder being moved inside itself.

export const FIELD_TYPES = ['text', 'number', 'date', 'choice', 'url', 'boolean'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldDef {
  id: string;
  name: string;
  type: FieldType;
  /** The options of a choice field; empty for other types. */
  choices: string[];
}

/** A stored value. Dates are 'YYYY-MM-DD'. */
export type FieldValue = string | number | boolean;

export type CheckedValue = { ok: true; value: FieldValue } | { ok: false; message: string };

const MAX_TEXT = 2000;

function isRealDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** Checks a value against its field's type, and tidies it (trims text). */
export function checkFieldValue(field: FieldDef, value: unknown): CheckedValue {
  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string' || value.trim() === '') return { ok: false, message: 'Enter some text' };
      if (value.length > MAX_TEXT) return { ok: false, message: 'Use shorter text' };
      return { ok: true, value: value.trim() };
    }
    case 'number': {
      const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
      if (!Number.isFinite(number)) return { ok: false, message: 'Enter a number' };
      return { ok: true, value: number };
    }
    case 'date':
      if (typeof value !== 'string' || !isRealDate(value)) return { ok: false, message: 'Enter a real date' };
      return { ok: true, value };
    case 'choice':
      if (typeof value !== 'string' || !field.choices.includes(value)) return { ok: false, message: 'Pick one of the choices' };
      return { ok: true, value };
    case 'url': {
      if (typeof value !== 'string') return { ok: false, message: 'Enter a web address' };
      const text = value.trim();
      try {
        const parsed = new URL(text);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('not web');
      } catch {
        return { ok: false, message: 'Enter a web address starting with http:// or https://' };
      }
      return { ok: true, value: text };
    }
    case 'boolean':
      if (typeof value !== 'boolean') return { ok: false, message: 'Choose yes or no' };
      return { ok: true, value };
  }
}

/** A value as words, for search and for showing. Never throws, whatever is stored. */
export function fieldValueText(field: FieldDef | undefined, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (field?.type === 'boolean' && typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export const FILTER_OPS = ['eq', 'contains', 'lt', 'gt', 'set', 'unset'] as const;
export type FilterOp = (typeof FILTER_OPS)[number];
export interface FieldFilter {
  fieldId: string;
  op: FilterOp;
  value?: FieldValue;
}

/**
 * A stored value read as its field's type now. Anything that no longer fits
 * (the field changed, or the value is odd) is read as text, so comparing it
 * never fails.
 */
function typed(field: FieldDef, value: unknown): { kind: 'number'; value: number } | { kind: 'text'; value: string } | null {
  if (value === null || value === undefined) return null;
  if (field.type === 'number' && typeof value === 'number' && Number.isFinite(value)) return { kind: 'number', value };
  return { kind: 'text', value: fieldValueText(field, value) };
}

function compareTyped(
  a: NonNullable<ReturnType<typeof typed>>,
  b: NonNullable<ReturnType<typeof typed>>,
): number {
  if (a.kind === 'number' && b.kind === 'number') return a.value - b.value;
  // Dates as 'YYYY-MM-DD' sort correctly as text.
  return String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: 'base' });
}

function matchesOne(values: Record<string, unknown>, filter: FieldFilter, field: FieldDef | undefined): boolean {
  if (!field) return false;
  const stored = typed(field, values[filter.fieldId]);
  if (filter.op === 'set') return stored !== null && stored.value !== '';
  if (filter.op === 'unset') return stored === null || stored.value === '';
  if (stored === null || filter.value === undefined) return false;
  const wanted = typed(field, filter.value);
  if (!wanted) return false;

  switch (filter.op) {
    case 'eq':
      if (field.type === 'boolean') return values[filter.fieldId] === filter.value;
      return compareTyped(stored, wanted) === 0;
    case 'contains':
      return String(stored.value).toLowerCase().includes(String(wanted.value).toLowerCase());
    case 'lt':
      return compareTyped(stored, wanted) < 0;
    case 'gt':
      return compareTyped(stored, wanted) > 0;
    default:
      return false;
  }
}

/** Whether a thing's field values pass every filter. A filter on an unknown field matches nothing. */
export function matchesFilters(values: Record<string, unknown>, filters: FieldFilter[], fields: FieldDef[]): boolean {
  return filters.every((filter) => matchesOne(values, filter, fields.find((field) => field.id === filter.fieldId)));
}

/** Orders two things by one field's value, smallest first; things without a value go last. */
export function compareByField(a: Record<string, unknown>, b: Record<string, unknown>, field: FieldDef): number {
  const first = typed(field, a[field.id]);
  const second = typed(field, b[field.id]);
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return compareTyped(first, second);
}

/**
 * Whether putting folder `movingId` inside `targetParentId` would put it
 * inside itself. `parentOf` gives each folder's parent (null at the top).
 */
export function wouldCreateLoop(
  movingId: string,
  targetParentId: string | null,
  parentOf: (id: string) => string | null,
): boolean {
  const seen = new Set<string>();
  for (let current = targetParentId; current !== null; current = parentOf(current)) {
    if (current === movingId) return true;
    // A loop already in the data must not hang the check.
    if (seen.has(current)) return true;
    seen.add(current);
  }
  return false;
}
