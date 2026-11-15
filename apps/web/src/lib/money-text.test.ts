import {
  addDays,
  addMonths,
  budgetText,
  dayLabel,
  formatMoney,
  monthComparisonText,
  monthLabel,
  owedText,
  todayComparisonText,
  todayInZone,
} from './money-text';

const cmp = (current: number, previous: number | null) => ({
  current,
  previous,
  change: previous === null ? null : current - previous,
  percent: previous === null || previous === 0 ? null : Math.round(((current - previous) / previous) * 100),
});

describe('formatMoney', () => {
  it.each([
    [8000, '৳80'],
    [125050, '৳1,250.50'],
    [0, '৳0'],
    [-53500, '−৳535'],
    [5, '৳0.05'],
  ])('%s -> %s', (paisa, text) => {
    expect(formatMoney(paisa, '৳')).toBe(text);
  });
});

describe('dates', () => {
  it('todayInZone follows the zone, not the device', () => {
    const late = new Date('2026-11-13T20:00:00Z');
    expect(todayInZone('Asia/Dhaka', late)).toBe('2026-11-14');
    expect(todayInZone('UTC', late)).toBe('2026-11-13');
  });

  it('addDays crosses months and years', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('addMonths crosses years', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
  });

  it('labels', () => {
    expect(dayLabel('2026-11-13')).toBe('Friday, 13 November');
    expect(monthLabel('2026-11')).toBe('November 2026');
  });
});

describe('todayComparisonText', () => {
  it('says less, more or the same as last week', () => {
    expect(todayComparisonText(cmp(23500, 30000), '2026-11-13', '৳')).toBe('৳65 less than last Friday');
    expect(todayComparisonText(cmp(30000, 23500), '2026-11-13', '৳')).toBe('৳65 more than last Friday');
    expect(todayComparisonText(cmp(500, 500), '2026-11-13', '৳')).toBe('Same as last Friday');
  });

  it('says nothing when there is no earlier day to compare', () => {
    expect(todayComparisonText(cmp(500, null), '2026-11-13', '৳')).toBe('');
  });
});

describe('monthComparisonText', () => {
  it('gives a percentage against last month', () => {
    expect(monthComparisonText(cmp(11200, 10000), 'October', '৳')).toBe('12% more than October');
    expect(monthComparisonText(cmp(7500, 10000), 'October', '৳')).toBe('25% less than October');
    expect(monthComparisonText(cmp(10000, 10000), 'October', '৳')).toBe('Same as October');
  });

  it('gives the amount when last month was zero', () => {
    expect(monthComparisonText(cmp(50000, 0), 'October', '৳')).toBe('৳500 more than October');
  });

  it('says so when there is no earlier month', () => {
    expect(monthComparisonText(cmp(500, null), 'October', '৳')).toBe('No earlier month to compare');
  });
});

describe('budgetText', () => {
  it('describes each state', () => {
    expect(budgetText(30000, 100000, 'ok', '৳')).toBe('30% of ৳1,000 budget used');
    expect(budgetText(80000, 100000, 'warning', '৳')).toBe('80% of ৳1,000 budget used');
    expect(budgetText(145000, 100000, 'over', '৳')).toBe('Over budget by ৳450');
  });
});

describe('owedText', () => {
  it('describes each direction', () => {
    expect(owedText('Rahim', 50000, '৳')).toBe('Rahim owes you ৳500');
    expect(owedText('Karim', -120000, '৳')).toBe('You owe Karim ৳1,200');
    expect(owedText('Rahim', 0, '৳')).toBe('Settled with Rahim');
  });
});

describe('month wording', () => {
  it('knows the last day of a month, leap years included', async () => {
    const { lastDayOfMonth, shortDay } = await import('./money-text');
    expect(lastDayOfMonth('2026-11')).toBe('2026-11-30');
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastDayOfMonth('2026-12')).toBe('2026-12-31');
    expect(shortDay('2026-11-13')).toBe('13 Nov');
  });

  it('says what a kind of day costs', async () => {
    const { dayTypeText } = await import('./money-text');
    expect(dayTypeText('Workday', 31000, 22, '৳')).toBe('Workday: ৳310 a day over 22 days');
    expect(dayTypeText('Class day', 12050.4, 1, '৳')).toBe('Class day: ৳120.50 a day over 1 day');
  });

  it('compares one category with the month before', async () => {
    const { categoryChangeText } = await import('./money-text');
    expect(categoryChangeText(150000, 100000, 'October', '৳')).toBe('৳500 more than October');
    expect(categoryChangeText(80000, 100000, 'October', '৳')).toBe('৳200 less than October');
    expect(categoryChangeText(80000, 80000, 'October', '৳')).toBe('Same as October');
    expect(categoryChangeText(20000, 0, 'October', '৳')).toBe('Nothing in October');
    expect(categoryChangeText(20000, null, 'October', '৳')).toBe('');
  });
});
