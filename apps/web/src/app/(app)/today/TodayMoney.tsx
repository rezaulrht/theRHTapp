'use client';

import { Amount } from '@pa/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BarChart } from '@/components/charts/BarChart';
import { SpotlightPanel } from '@/components/motion/SpotlightPanel';
import { useSettings } from '@/components/SettingsProvider';
import { money, type TodayReport } from '@/lib/money';
import { addDays, formatMoney, todayComparisonText } from '@/lib/money-text';
import { dailySpend, weekdayShort } from '@/lib/today-charts';

/** Money's block on the Today page: what went out today, against last week, and the balances. */
export function TodayMoney() {
  const { settings } = useSettings();
  const [report, setReport] = useState<TodayReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    money
      .today()
      .then(setReport)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load.'));
  }, []);

  const [week, setWeek] = useState<{ date: string; spent: number }[] | null>(null);
  const reportDate = report?.date;

  // The chart is a bonus: if it cannot load, the card simply has no chart.
  useEffect(() => {
    if (!reportDate) return;
    money
      .entries({ from: addDays(reportDate, -6), to: reportDate, limit: 500 })
      .then((entries) => setWeek(dailySpend(entries, reportDate)))
      .catch(() => setWeek(null));
  }, [reportDate]);

  const symbol = settings?.['general.currency'].symbol;
  const comparison =
    report && symbol !== undefined
      ? todayComparisonText(report.comparedToSameWeekdayLastWeek, report.date, symbol)
      : '';

  return (
    <SpotlightPanel className="flex h-full flex-col">
      <h2 className="font-display text-2xl text-ivory">
        <Link href="/money" className="hover:text-brass">
          Money
        </Link>
      </h2>

      {error ? (
        <p role="alert" className="mt-4 text-sm text-alert">
          {error}
        </p>
      ) : null}

      {report && symbol !== undefined ? (
        <>
          <p className="mt-4 text-sm text-sage">Spent today</p>
          <Amount
            value={report.spent / 100}
            currency={symbol}
            animate
            className="mt-2 block text-5xl leading-none text-ivory"
          />
          {comparison ? <p className="mt-2 text-sm text-brass">{comparison}</p> : null}

          {week ? (
            <div className="mt-5">
              <BarChart
                label="Spending, last 7 days"
                bars={week.map((day, index) => ({
                  key: day.date,
                  label: weekdayShort(day.date),
                  value: day.spent,
                  highlight: index === week.length - 1,
                  ariaLabel: `${weekdayShort(day.date)}: ${formatMoney(day.spent, symbol)}`,
                }))}
              />
              <p className="mt-2 text-sm text-sage">
                {formatMoney(
                  week.reduce((sum, day) => sum + day.spent, 0),
                  symbol,
                )}{' '}
                in the last 7 days
              </p>
            </div>
          ) : null}

          <ul className="mt-5 flex flex-col gap-1.5 border-t border-hairline pt-4 text-sm">
            {report.balances.map((balance) => (
              <li key={balance.id} className="flex justify-between gap-4">
                <span className="text-sage">{balance.name}</span>
                <span className={`tabular-nums ${balance.balance < 0 ? 'text-alert' : 'text-ivory'}`}>
                  {formatMoney(balance.balance, symbol)}
                </span>
              </li>
            ))}
          </ul>

          <Link
            href="/money?add=1"
            className="mt-6 inline-flex min-h-11 items-center justify-center self-start rounded-full border border-brass px-6 text-sm font-medium text-brass transition-colors duration-200 hover:bg-brass hover:text-ground"
          >
            Add expense
          </Link>
        </>
      ) : error ? null : (
        <p className="mt-4 text-sm text-sage">Adding up today…</p>
      )}
    </SpotlightPanel>
  );
}
