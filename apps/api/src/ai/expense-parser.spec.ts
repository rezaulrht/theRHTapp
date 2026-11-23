import { AssistantError, askDeepSeek } from './deepseek';
import { buildMessages, readReply } from './expense-parser';

const accounts = [
  { id: 'a1', name: 'Cash' },
  { id: 'a2', name: 'bKash' },
];
const categories = [
  { id: 'c1', name: 'Food' },
  { id: 'c2', name: 'Transport' },
];
const today = '2026-11-23';

describe('buildMessages', () => {
  it('names the accounts, the categories and today, and passes the sentence on as it was typed', () => {
    const [system, user] = buildMessages('Lunch 250 bkash', ['Cash', 'bKash'], ['Food'], today);
    expect(system!.role).toBe('system');
    expect(system!.content).toContain('"bKash"');
    expect(system!.content).toContain('"Food"');
    expect(system!.content).toContain(today);
    expect(user).toEqual({ role: 'user', content: 'Lunch 250 bkash' });
  });
});

describe('readReply', () => {
  it('turns a good answer into paisa and the ids of the account and category', () => {
    expect(readReply({ name: 'Lunch', amount: 250, account: 'bKash', category: 'Food', date: null }, accounts, categories, today)).toEqual({
      name: 'Lunch',
      amount: 25000,
      accountId: 'a2',
      categoryId: 'c1',
      date: today,
    });
  });

  it('keeps taka with paisa exact', () => {
    expect(readReply({ name: 'Tea', amount: 12.5 }, accounts, categories, today)?.amount).toBe(1250);
    expect(readReply({ name: 'Tea', amount: 0.1 + 0.2 }, accounts, categories, today)?.amount).toBe(30);
  });

  it('matches names ignoring case, and leaves the id empty for a name it does not know', () => {
    const result = readReply({ name: 'Bus', amount: 40, account: 'BKASH', category: 'Groceries' }, accounts, categories, today);
    expect(result?.accountId).toBe('a2');
    expect(result?.categoryId).toBeNull();
  });

  it('uses a named day in the past, but never a day that has not come or one that is not real', () => {
    expect(readReply({ name: 'Taxi', amount: 90, date: '2026-11-20' }, accounts, categories, today)?.date).toBe('2026-11-20');
    expect(readReply({ name: 'Taxi', amount: 90, date: '2026-12-25' }, accounts, categories, today)?.date).toBe(today);
    expect(readReply({ name: 'Taxi', amount: 90, date: '2026-13-45' }, accounts, categories, today)?.date).toBe(today);
    expect(readReply({ name: 'Taxi', amount: 90, date: 'yesterday' }, accounts, categories, today)?.date).toBe(today);
  });

  it.each([
    ['an error from the model', { error: 'no amount' }],
    ['a zero amount', { name: 'Free', amount: 0 }],
    ['a negative amount', { name: 'Refund', amount: -50 }],
    ['an amount that is text', { name: 'Lunch', amount: '250' }],
    ['no name', { amount: 250 }],
    ['an absurd amount', { name: 'Lunch', amount: 1e15 }],
    ['not an object', 'Lunch 250'],
    ['nothing', null],
  ])('rejects %s', (_label, reply) => {
    expect(readReply(reply, accounts, categories, today)).toBeNull();
  });
});

describe('askDeepSeek', () => {
  const messages = [{ role: 'user' as const, content: 'x' }];
  const answer = (content: unknown, status = 200) =>
    (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status })) as unknown as typeof fetch;

  it('sends the key and the messages, and returns the JSON the model wrote', async () => {
    const send = jest.fn(answer('{"name":"Lunch","amount":250}'));
    expect(await askDeepSeek('secret', messages, send)).toEqual({ name: 'Lunch', amount: 250 });
    const [url, init] = send.mock.calls[0]!;
    expect(String(url)).toBe('https://api.deepseek.com/chat/completions');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(JSON.parse(init!.body as string).response_format).toEqual({ type: 'json_object' });
  });

  it('fails clearly when the service errors, does not answer, or sends something that is not JSON', async () => {
    await expect(askDeepSeek('k', messages, answer('{}', 500))).rejects.toBeInstanceOf(AssistantError);
    await expect(askDeepSeek('k', messages, (async () => { throw new Error('offline'); }) as unknown as typeof fetch)).rejects.toBeInstanceOf(AssistantError);
    await expect(askDeepSeek('k', messages, answer('not json'))).rejects.toBeInstanceOf(AssistantError);
    await expect(askDeepSeek('k', messages, answer(undefined))).rejects.toBeInstanceOf(AssistantError);
  });
});

describe('secret box', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { seal, unseal, isSealed } = require('./secret-box') as typeof import('./secret-box');

  it('gives the text back with the secret it was sealed with, and not otherwise', () => {
    const sealed = seal('sk-abc123456789', 'server secret');
    expect(isSealed(sealed)).toBe(true);
    expect(JSON.stringify(sealed)).not.toContain('abc123456789');
    expect(unseal(sealed, 'server secret')).toBe('sk-abc123456789');
    expect(unseal(sealed, 'another secret')).toBeNull();
  });

  it('notices a value that was changed, and seals the same text differently each time', () => {
    const sealed = seal('sk-abc123456789', 's');
    expect(unseal({ ...sealed, data: seal('other text here', 's').data }, 's')).toBeNull();
    expect(seal('same', 's').data).not.toBe(seal('same', 's').data);
  });

  it('does not mistake other values for a sealed one', () => {
    expect(isSealed(null)).toBe(false);
    expect(isSealed({ iv: 'x' })).toBe(false);
    expect(isSealed('text')).toBe(false);
  });
});
