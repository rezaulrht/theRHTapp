// Reading amounts typed by hand. Kept free of other imports so the web app can
// use it in the browser without pulling in the rest of this package.

/** The largest single amount accepted: 20,000,000 taka. Keeps sums well inside safe integers. */
export const MAX_AMOUNT = 2_000_000_000;

export type ParsedAmount = { ok: true; paisa: number } | { ok: false; message: string };

/**
 * Reads an amount typed by hand, in taka, into paisa. Works on the digits
 * directly so no paisa is lost to floating point.
 */
export function parseAmount(input: string): ParsedAmount {
  const text = input.trim();
  if (text === '') return { ok: false, message: 'Enter an amount' };

  const match = /^(\d*|\d{1,3}(?:,\d{3})+)(?:\.(\d*))?$/.exec(text);
  const whole = match?.[1]?.replace(/,/g, '') ?? '';
  const fraction = match?.[2] ?? '';
  if (!match || (whole === '' && fraction === '')) {
    return { ok: false, message: 'Enter a number, like 80 or 12.50' };
  }
  if (fraction.length > 2) return { ok: false, message: 'Use at most two decimal places' };
  if (whole.replace(/^0+/, '').length > 9) return { ok: false, message: 'That amount is too large' };

  const paisa = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0');
  if (paisa === 0) return { ok: false, message: 'Enter an amount above zero' };
  if (paisa > MAX_AMOUNT) return { ok: false, message: 'That amount is too large' };
  return { ok: true, paisa };
}
