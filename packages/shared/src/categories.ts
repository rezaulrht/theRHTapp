// Choices for a category's look. No other imports, so the browser can use it alone.

/** Colours a category can take. All read clearly on the green ground. */
export const CATEGORY_COLORS = {
  brass: '#c8a662',
  coral: '#e8795f',
  sky: '#7fb7d9',
  sage: '#9fb3a8',
  rose: '#d98fa6',
  lilac: '#a99bd6',
  mint: '#7fd1ae',
  sand: '#d9c7a0',
} as const;
export type CategoryColor = keyof typeof CATEGORY_COLORS;

export const CATEGORY_ICONS = [
  'bus',
  'food',
  'book',
  'bill',
  'fee',
  'bag',
  'home',
  'health',
  'phone',
  'gift',
  'coffee',
  'dot',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];
