'use client';

import { Button, Field } from '@pa/ui';
import { useState, type FormEvent } from 'react';
import { money, paisaToInput, toPaisa, type Budget, type Category } from '@/lib/money';
import { Problems, SavedNote, Section, useAction } from './shared';

function BudgetRow({
  label,
  categoryId,
  amount,
  hint,
  onChanged,
}: {
  label: string;
  categoryId: string | null;
  amount: number | undefined;
  hint?: string;
  onChanged(): Promise<void>;
}) {
  const [text, setText] = useState(amount ? paisaToInput(amount) : '');
  const [textError, setTextError] = useState<string | undefined>();
  const save = useAction();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (save.busy) return;
    // Empty means no budget.
    let paisa = 0;
    if (text.trim() !== '') {
      const parsed = toPaisa(text);
      if (!parsed.ok) {
        setTextError(parsed.message);
        return;
      }
      paisa = parsed.paisa;
    }
    setTextError(undefined);
    if (await save.run(() => money.setBudget(categoryId, paisa))) await onChanged();
  }

  return (
    <li className="border-b border-hairline py-4">
      <form onSubmit={onSubmit} method="post" noValidate className="flex max-w-md items-end gap-3">
        <Field
          className="flex-1"
          label={label}
          inputMode="decimal"
          autoComplete="off"
          placeholder="No budget"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            save.touch();
          }}
          error={textError ?? save.errorAt('amount')}
          hint={hint}
        />
        <Button type="submit" variant="outline" loading={save.busy} aria-label={`Save the budget for ${label}`}>
          Save
        </Button>
        <span className="mb-3 w-16">
          <SavedNote show={save.done} />
        </span>
      </form>
      <Problems list={save.problems(['amount'])} />
    </li>
  );
}

/** A monthly limit for the whole month and for each category. Empty means none. */
export function BudgetsEditor({
  budgets,
  categories,
  onChanged,
}: {
  budgets: Budget[];
  categories: Category[];
  onChanged(): Promise<void>;
}) {
  const amountFor = (categoryId: string | null) => budgets.find((budget) => budget.categoryId === categoryId)?.amount;
  return (
    <Section
      title="Budgets"
      intro="What you mean to spend in a month. Leave a box empty for no budget. You are warned as a budget fills up."
    >
      <ul className="border-t border-hairline">
        <BudgetRow
          label="Whole month"
          categoryId={null}
          amount={amountFor(null)}
          hint="Everything you spend, across all categories."
          onChanged={onChanged}
        />
        {categories
          .filter((category) => !category.archived)
          .map((category) => (
            <BudgetRow
              key={category.id}
              label={category.name}
              categoryId={category.id}
              amount={amountFor(category.id)}
              onChanged={onChanged}
            />
          ))}
      </ul>
    </Section>
  );
}
