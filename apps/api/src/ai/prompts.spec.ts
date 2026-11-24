import { daysInMonthOf, projectMonth } from './snapshots';
import { bulkMessages, categoryMessages, localToInstant, readBulk, readCategory, readIntent, readRoutine, routerMessages } from './prompts';

const accounts = [{ id: 'a1', name: 'Cash' }, { id: 'a2', name: 'bKash' }];
const categories = [{ id: 'c1', name: 'Food' }, { id: 'c2', name: 'Transport' }];
const today = '2026-11-23';

describe('category', () => {
  it('asks for one of the real names', () => {
    expect(categoryMessages('rickshaw', ['Food', 'Transport'])[0]!.content).toContain('"Transport"');
  });
  it('maps the answer to an id, tolerating case, and gives null for a name that is not a category', () => {
    expect(readCategory({ category: 'transport' }, categories)).toBe('c2');
    expect(readCategory({ category: 'Pets' }, categories)).toBeNull();
    expect(readCategory({ category: null }, categories)).toBeNull();
    expect(readCategory('nonsense', categories)).toBeNull();
  });
});

describe('several expenses', () => {
  it('passes the list through as typed', () => {
    expect(bulkMessages('tea 20\nlunch 180', ['Cash'], ['Food'], today)[1]!.content).toBe('tea 20\nlunch 180');
  });
  it('keeps the good lines, drops the ones without an amount, and caps the list', () => {
    const reply = { items: [{ name: 'Tea', amount: 20, category: 'Food' }, { name: 'Gift' }, { name: 'Taxi', amount: 90, account: 'bKash' }] };
    const items = readBulk(reply, accounts, categories, today);
    expect(items.map((item) => [item.name, item.amount])).toEqual([['Tea', 2000], ['Taxi', 9000]]);
    expect(items[0]!.categoryId).toBe('c1');
    expect(items[1]!.accountId).toBe('a2');
    const many = { items: Array.from({ length: 50 }, (_, index) => ({ name: `Item ${index}`, amount: 10 })) };
    expect(readBulk(many, accounts, categories, today)).toHaveLength(30);
    expect(readBulk({ items: 'x' }, accounts, categories, today)).toEqual([]);
  });
});

describe('the ask box router', () => {
  it('says what time it is now, in the right zone', () => {
    expect(routerMessages('hi', '2026-11-23T20:00 (Monday)', 'Asia/Dhaka')[0]!.content).toContain('2026-11-23T20:00');
  });
  it('reads each kind of message, and falls back to a question for anything unclear', () => {
    expect(readIntent({ type: 'expense' })).toEqual({ type: 'expense' });
    expect(readIntent({ type: 'reminder', title: 'Pay rent', when: '2026-12-05T09:00' })).toEqual({ type: 'reminder', title: 'Pay rent', when: '2026-12-05T09:00' });
    expect(readIntent({ type: 'reminder', title: 'Pay rent', when: null })).toEqual({ type: 'question' });
    expect(readIntent({ type: 'nonsense' })).toEqual({ type: 'question' });
    expect(readIntent(null)).toEqual({ type: 'question' });
  });
  it('turns a local time into an instant, and refuses a past or malformed time', () => {
    const now = new Date('2026-11-23T10:00:00Z');
    expect(localToInstant('2026-12-05T09:00', 'Asia/Dhaka', now)).toBe('2026-12-05T03:00:00.000Z');
    expect(localToInstant('2026-11-01T09:00', 'Asia/Dhaka', now)).toBeNull();
    expect(localToInstant('tomorrow 9am', 'Asia/Dhaka', now)).toBeNull();
    expect(localToInstant('2026-13-40T09:00', 'Asia/Dhaka', now)).toBeNull();
  });
});

describe('routine builder', () => {
  it('builds items the routine accepts, in hundredths of a point, every day unless told otherwise', () => {
    const items = readRoutine({
      items: [
        { name: 'Gym', points: 10, kind: 'fixed', start: '06:30', due: '07:30', days: [1, 3, 5] },
        { name: 'Fajr', points: 8, kind: 'prayer', prayer: 'fajr' },
        { name: 'Drink water', points: 5, kind: 'repeating', start: '09:00', due: '21:00', everyMinutes: 90, target: 8 },
      ],
    });
    expect(items.map((item) => item.name)).toEqual(['Gym', 'Fajr', 'Drink water']);
    expect(items[0]).toMatchObject({ points: 1000, timing: { kind: 'fixed', start: '06:30', due: '07:30' }, appliesTo: { kind: 'weekdays', days: [1, 3, 5] } });
    expect(items[1]!.appliesTo).toEqual({ kind: 'weekdays', days: [0, 1, 2, 3, 4, 5, 6] });
    expect(items[2]!.timing).toEqual({ kind: 'repeating', start: '09:00', end: '21:00', everyMinutes: 90, target: 8 });
    expect(items[0]!.reminders).toEqual({ channels: ['push'], onOpen: true, onDue: false, warn: true });
  });
  it('drops items that break the routine rules instead of passing them on', () => {
    const items = readRoutine({
      items: [
        { name: 'Backwards', points: 5, kind: 'fixed', start: '09:00', due: '08:00' },
        { name: 'Free', points: 0, kind: 'fixed' },
        { name: 'Too often', points: 5, kind: 'repeating', start: '09:00', due: '10:00', everyMinutes: 1, target: 3 },
        { name: 'No window', points: 5, kind: 'repeating', everyMinutes: 60, target: 3 },
        { name: '', points: 5, kind: 'fixed' },
        { name: 'Read', points: 4, kind: 'fixed', due: '22:00' },
      ],
    });
    expect(items.map((item) => item.name)).toEqual(['Read']);
    expect(readRoutine('nonsense')).toEqual([]);
  });
});

describe('budget pace', () => {
  it('carries spending so far to the end of the month at the same daily pace', () => {
    expect(projectMonth(30_000, 10, 30)).toBe(90_000);
    expect(projectMonth(5_000, 0, 30)).toBe(5_000);
  });
  it('knows how long a month is', () => {
    expect(daysInMonthOf('2026-11')).toBe(30);
    expect(daysInMonthOf('2026-02')).toBe(28);
    expect(daysInMonthOf('2028-02')).toBe(29);
  });
});
