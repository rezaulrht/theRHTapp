import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettingsPatch, settingsSchema } from './settings';

describe('settings', () => {
  it('defaults are valid', () => {
    expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
  });

  it('accepts a partial patch', () => {
    const r = parseSettingsPatch(defaultSettings, { 'general.timezone': 'Asia/Karachi' });
    expect(r.ok && r.value['general.timezone']).toBe('Asia/Karachi');
  });

  it('keeps untouched keys when patching', () => {
    const r = parseSettingsPatch(defaultSettings, { 'general.notificationEmail': 'me@example.test' });
    expect(r.ok && r.value['general.currency']).toEqual({ symbol: '৳', code: 'BDT' });
  });

  it.each([
    [{ 'general.timezone': 'Mars/Olympus' }, 'general.timezone'],
    [{ 'general.quietHours': { enabled: true, start: '25:99', end: '05:00' } }, 'general.quietHours.start'],
    [{ 'general.weekPattern': { ...defaultSettings['general.weekPattern'], fri: 'holiday' } }, 'general.weekPattern.fri'],
    [{ 'general.dayTypes': [] }, 'general.dayTypes'],
    [{ 'nope.key': 1 }, 'nope.key'],
  ])('rejects %j naming %s', (patch, path) => {
    const r = parseSettingsPatch(defaultSettings, patch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.path)).toContain(path);
  });

  it('rejects removing a day type still used by the week pattern', () => {
    const r = parseSettingsPatch(defaultSettings, {
      'general.dayTypes': [{ id: 'workday', name: 'Workday' }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate day type ids', () => {
    const r = parseSettingsPatch(defaultSettings, {
      'general.dayTypes': [
        { id: 'workday', name: 'Workday' },
        { id: 'workday', name: 'Again' },
        { id: 'classday', name: 'Class day' },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a patch that is not an object', () => {
    expect(parseSettingsPatch(defaultSettings, 'nope').ok).toBe(false);
    expect(parseSettingsPatch(defaultSettings, null).ok).toBe(false);
  });
});

describe('money settings', () => {
  it('have valid defaults', () => {
    expect(defaultSettings['money.budgetWarnPercent']).toBe(80);
    expect(defaultSettings['money.dailyReminder']).toEqual({
      enabled: true,
      time: '21:00',
      channels: ['push'],
      skipIfLogged: true,
    });
  });

  it.each([0, 101, 80.5])('rejects a warning percentage of %s', (value) => {
    expect(parseSettingsPatch(defaultSettings, { 'money.budgetWarnPercent': value }).ok).toBe(false);
  });

  it('accepts a warning percentage from 1 to 100', () => {
    expect(parseSettingsPatch(defaultSettings, { 'money.budgetWarnPercent': 1 }).ok).toBe(true);
    expect(parseSettingsPatch(defaultSettings, { 'money.budgetWarnPercent': 100 }).ok).toBe(true);
  });

  it('rejects a bad reminder time and an unknown channel', () => {
    const base = defaultSettings['money.dailyReminder'];
    const badTime = parseSettingsPatch(defaultSettings, { 'money.dailyReminder': { ...base, time: '9pm' } });
    expect(badTime.ok).toBe(false);
    if (!badTime.ok) expect(badTime.errors[0]!.path).toBe('money.dailyReminder.time');
    expect(parseSettingsPatch(defaultSettings, { 'money.dailyReminder': { ...base, channels: ['sms'] } }).ok).toBe(false);
  });

  it('accepts a reminder with no channels', () => {
    const base = defaultSettings['money.dailyReminder'];
    expect(parseSettingsPatch(defaultSettings, { 'money.dailyReminder': { ...base, channels: [] } }).ok).toBe(true);
  });
});
