import type { PrismaClient } from '@pa/db';
import { todayIn } from '@pa/shared';
import { toDbDate } from './common';

const ACCOUNTS = ['Bank', 'bKash', 'Cash'];

const CATEGORIES = [
  { name: 'Travel', color: 'sky', icon: 'bus' },
  { name: 'Food', color: 'coral', icon: 'food' },
  { name: 'Study', color: 'lilac', icon: 'book' },
  { name: 'Bills', color: 'sand', icon: 'bill' },
  { name: 'Fees', color: 'sage', icon: 'fee', isFees: true },
  { name: 'Other', color: 'brass', icon: 'dot' },
];

/**
 * Gives a brand-new installation the owner's three accounts and a starting
 * set of categories. These are ordinary rows the owner can rename, reorder or
 * archive; nothing here is fixed. It does nothing once any account or
 * category exists, so it never brings back something the owner removed.
 */
export async function ensureMoneySeed(prisma: PrismaClient, timeZone = 'Asia/Dhaka'): Promise<void> {
  const [accounts, categories] = await Promise.all([
    prisma.moneyAccount.count(),
    prisma.moneyCategory.count(),
  ]);
  if (accounts > 0 || categories > 0) return;

  const openingDate = toDbDate(todayIn(timeZone));
  await prisma.$transaction([
    prisma.moneyAccount.createMany({
      data: ACCOUNTS.map((name, sortOrder) => ({ name, openingBalance: 0, openingDate, sortOrder })),
    }),
    prisma.moneyCategory.createMany({
      data: CATEGORIES.map((category, sortOrder) => ({ ...category, sortOrder })),
    }),
  ]);
}
