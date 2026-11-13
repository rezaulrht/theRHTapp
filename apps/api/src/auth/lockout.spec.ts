import { isLocked, registerFailure, type LockoutState } from './lockout';

const now = new Date('2026-11-13T00:00:00Z');
const fresh: LockoutState = { failedAttempts: 0, lockedUntil: null };

describe('lockout', () => {
  it('locks on the fifth failure for 15 minutes', () => {
    let s = fresh;
    for (let i = 0; i < 4; i++) s = registerFailure(s, now);
    expect(isLocked(s, now)).toBe(false);
    s = registerFailure(s, now);
    expect(s.lockedUntil).toEqual(new Date('2026-11-13T00:15:00Z'));
    expect(isLocked(s, new Date('2026-11-13T00:14:59Z'))).toBe(true);
    expect(isLocked(s, new Date('2026-11-13T00:15:00Z'))).toBe(false);
  });

  it('starts counting again after a lock has run out', () => {
    const expired: LockoutState = { failedAttempts: 5, lockedUntil: new Date('2026-11-12T23:00:00Z') };
    expect(registerFailure(expired, now)).toEqual({ failedAttempts: 1, lockedUntil: null });
  });

  it('is not locked with no failures', () => {
    expect(isLocked(fresh, now)).toBe(false);
  });
});
