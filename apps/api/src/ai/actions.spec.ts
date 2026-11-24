import { actionMessages, actionSchema, MAX_ACTIONS, resolveActions, type ResolveContext } from './actions';

const context: ResolveContext = {
  habitItems: [
    { id: 'h1', name: 'Gym' },
    { id: 'h2', name: 'Fajr' },
  ],
  accounts: [
    { id: 'a1', name: 'Cash' },
    { id: 'a2', name: 'bKash' },
  ],
  categories: [
    { id: 'c1', name: 'Food' },
    { id: 'c2', name: 'Transport' },
  ],
  entries: [
    { id: 'e3', name: 'Lunch', date: '2026-11-23', amount: 25000, categoryId: 'c2' },
    { id: 'e2', name: 'Lunch', date: '2026-11-20', amount: 18000, categoryId: 'c2' },
    { id: 'e1', name: 'Rickshaw', date: '2026-11-20', amount: 6000, categoryId: 'c1' },
  ],
  today: '2026-11-23',
  habitDay: '2026-11-23',
  timeZone: 'Asia/Dhaka',
  now: new Date('2026-11-23T10:00:00Z'),
  money: (paisa) => `৳${paisa / 100}`,
};

const resolve = (...actions: object[]) => resolveActions({ actions }, context);

describe('resolveActions', () => {
  it('turns habit requests into exact items with a plain summary', () => {
    const { actions, notes } = resolve({ type: 'mark_habit_done', item: 'gym' }, { type: 'skip_habit', item: 'Fajr' }, { type: 'pause_habit', item: 'Gym' }, { type: 'resume_habit', item: 'Gym' });
    expect(notes).toEqual([]);
    expect(actions.map((action) => action.summary)).toEqual(['Mark Gym as done today', 'Skip Fajr today', 'Pause Gym', 'Put Gym back on the routine']);
    expect(actions[0]!.payload).toEqual({ type: 'mark_habit_done', itemId: 'h1', day: '2026-11-23', label: 'Gym' });
  });

  it('leaves out anything it cannot match to something real, and says so', () => {
    const { actions, notes } = resolve({ type: 'mark_habit_done', item: 'Swimming' }, { type: 'recategorize_entry', entry: 'Lunch', category: 'Pets' }, { type: 'recategorize_entry', entry: 'Haircut', category: 'Food' });
    expect(actions).toEqual([]);
    expect(notes).toEqual(['There is no habit called "Swimming" on your routine.', 'There is no category called "Pets".', 'Could not find a recent expense called "Haircut".']);
  });

  it('moves the most recent matching expense, or the one on the named day, and shows which', () => {
    const [latest] = resolve({ type: 'recategorize_entry', entry: 'lunch', onDate: null, category: 'food' }).actions;
    expect(latest!.payload).toMatchObject({ type: 'recategorize_entry', entryId: 'e3', categoryId: 'c1' });
    expect(latest!.summary).toBe('Move "Lunch" (৳250, 2026-11-23) to Food');
    const [older] = resolve({ type: 'recategorize_entry', entry: 'Lunch', onDate: '2026-11-20', category: 'Food' }).actions;
    expect(older!.payload).toMatchObject({ entryId: 'e2' });
  });

  it('adds expenses and income in paisa, filling a missing account or category, and never in the future', () => {
    const { actions } = resolve(
      { type: 'add_expense', name: 'Tea', amount: 20, account: 'bkash', category: 'Food', date: '2026-12-25' },
      { type: 'add_expense', name: 'Taxi', amount: 90 },
      { type: 'add_income', name: 'Salary', amount: 50000, account: 'Cash', date: '2026-11-01' },
    );
    expect(actions[0]!.payload).toMatchObject({ type: 'add_expense', amount: 2000, accountId: 'a2', categoryId: 'c1', date: '2026-11-23' });
    expect(actions[1]!.payload).toMatchObject({ accountId: 'a1', categoryId: 'c1' });
    expect(actions[2]!.payload).toMatchObject({ type: 'add_income', amount: 5000000, date: '2026-11-01' });
    expect(actions[2]!.summary).toBe('Add income: Salary, ৳50000, into Cash');
  });

  it('refuses spending or income with no amount', () => {
    const { actions, notes } = resolve({ type: 'add_expense', name: 'Gift' }, { type: 'add_income', name: 'Bonus', amount: 0 });
    expect(actions).toEqual([]);
    expect(notes).toHaveLength(2);
  });

  it('sets a category budget, the whole-month budget, or removes one', () => {
    const [category, month, remove] = resolve({ type: 'set_budget', category: 'Food', amount: 8000 }, { type: 'set_budget', category: null, amount: 30000 }, { type: 'set_budget', category: 'Transport', amount: 0 }).actions;
    expect(category).toMatchObject({ summary: 'Set the food budget to ৳8000 a month', payload: { type: 'set_budget', categoryId: 'c1', amount: 800000 } });
    expect(month!.payload).toMatchObject({ categoryId: null, amount: 3000000 });
    expect(month!.summary).toBe('Set the budget for the whole month to ৳30000 a month');
    expect(remove!.summary).toBe('Remove the transport budget');
  });

  it('keeps a reminder only if its time is real and in the future', () => {
    const { actions, notes } = resolve({ type: 'create_reminder', title: 'Pay rent', when: '2026-12-05T09:00' }, { type: 'create_reminder', title: 'Old', when: '2026-01-01T09:00' }, { type: 'create_reminder', title: 'Vague', when: 'soon' });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.payload).toMatchObject({ type: 'create_reminder', at: '2026-12-05T03:00:00.000Z' });
    expect(notes).toHaveLength(2);
  });

  it('ignores actions outside the list, such as deleting, and caps how many it takes', () => {
    expect(resolve({ type: 'delete_entry', entry: 'Lunch' }, { type: 'wipe_everything' }).actions).toEqual([]);
    const many = Array.from({ length: 25 }, () => ({ type: 'mark_habit_done', item: 'Gym' }));
    expect(resolve(...many).actions).toHaveLength(MAX_ACTIONS);
    expect(resolveActions('nonsense', context)).toEqual({ actions: [], notes: [] });
  });
});

describe('actionSchema', () => {
  const good = { type: 'mark_habit_done', itemId: 'h1', day: '2026-11-23' };
  it('accepts exactly the listed actions', () => {
    expect(actionSchema.safeParse(good).success).toBe(true);
    expect(actionSchema.safeParse({ type: 'set_budget', categoryId: null, amount: 0 }).success).toBe(true);
  });
  it('rejects anything else, including deletes, bad days and impossible amounts', () => {
    for (const bad of [
      { type: 'delete_entry', entryId: 'e1' },
      { ...good, day: 'today' },
      { type: 'add_expense', name: 'x', amount: -5, accountId: 'a', categoryId: 'c', date: '2026-11-23' },
      { type: 'add_expense', name: 'x', amount: 1.5, accountId: 'a', categoryId: 'c', date: '2026-11-23' },
      { type: 'create_reminder', title: 'x', at: 'tomorrow' },
      {},
    ]) {
      expect(actionSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('actionMessages', () => {
  it('lists only the real names and the whole catalog, and tells the model not to invent', () => {
    const text = actionMessages('mark gym done', { habits: ['Gym'], accounts: ['Cash'], categories: ['Food'] }, '2026-11-23', '2026-11-23T20:00 (Monday)', 'Asia/Dhaka')[0]!.content;
    expect(text).toContain('["Gym"]');
    expect(text).toContain('mark_habit_done');
    expect(text).toContain('set_budget');
    expect(text).toContain('Never invent');
    expect(text).not.toContain('delete_entry');
  });
});
