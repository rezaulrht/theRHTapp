import { dailySpend, topTags, weekdayShort } from './today-charts';

describe('weekdayShort', () => {
  it('names the day of the week for a calendar day', () => {
    expect(weekdayShort('2026-11-23')).toBe('Mon');
    expect(weekdayShort('2026-11-29')).toBe('Sun');
  });
});

describe('dailySpend', () => {
  const entry = (kind: string, date: string, amount: number) => ({ kind, date, amount }) as Parameters<typeof dailySpend>[0][number];

  it('gives seven days ending today, oldest first, with empty days at zero', () => {
    const days = dailySpend([], '2026-11-23');
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: '2026-11-17', spent: 0 });
    expect(days[6]).toEqual({ date: '2026-11-23', spent: 0 });
  });

  it('adds up expenses for a day and ignores everything else and days outside the range', () => {
    const days = dailySpend(
      [
        entry('expense', '2026-11-23', 5000),
        entry('expense', '2026-11-23', 2500),
        entry('income', '2026-11-23', 90000),
        entry('transfer', '2026-11-22', 1000),
        entry('expense', '2026-11-20', 800),
        entry('expense', '2026-11-01', 9999),
      ],
      '2026-11-23',
    );
    expect(days.find((day) => day.date === '2026-11-23')?.spent).toBe(7500);
    expect(days.find((day) => day.date === '2026-11-22')?.spent).toBe(0);
    expect(days.find((day) => day.date === '2026-11-20')?.spent).toBe(800);
    expect(days.some((day) => day.date === '2026-11-01')).toBe(false);
  });
});

describe('topTags', () => {
  it('keeps the most used tags, most first, and drops empty ones', () => {
    const tags = [
      { name: 'a', count: 1 },
      { name: 'b', count: 9 },
      { name: 'c', count: 0 },
      { name: 'd', count: 4 },
    ];
    expect(topTags(tags, 2).map((tag) => tag.name)).toEqual(['b', 'd']);
    expect(topTags(tags).map((tag) => tag.name)).toEqual(['b', 'd', 'a']);
  });
});
