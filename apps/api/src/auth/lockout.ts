export const MAX_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: Date | null;
}

export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** The state after one more wrong password. A lock that has run out starts a new count. */
export function registerFailure(state: LockoutState, now: Date): LockoutState {
  const lockExpired = state.lockedUntil !== null && !isLocked(state, now);
  const failedAttempts = lockExpired ? 1 : state.failedAttempts + 1;
  if (failedAttempts >= MAX_ATTEMPTS) {
    return { failedAttempts, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) };
  }
  return { failedAttempts, lockedUntil: null };
}
