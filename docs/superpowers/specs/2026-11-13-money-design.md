# Money

Part of the [personal apps design](2026-11-13-overview-design.md). Lines marked
**(call)** are the designer's decisions.

Money replaces the owner's paper notebook. In the notebook each day is a page;
each line is a name and an amount; each line is paid from bank, bKash or cash;
and the remaining balance of each is rewritten by hand. Return trips are
written as one combined line ("office rickshaw, both ways").

It is done when the owner can stop using the notebook.

## Accounts

- Accounts are where money sits. The starting three are Bank, bKash and Cash.
  The owner can add, rename, reorder and archive accounts.
- Each account has an opening balance and date, entered once.
- The current balance is always calculated from the opening balance plus every
  entry; it is never stored **(call)**. This keeps balances correct when a past
  entry is edited.
- If the real balance drifts, the owner enters the true figure and the app
  records a correction entry for the difference.
- All balances are visible at the top of the Money page.

## Entries

Four kinds:

| Kind | Effect |
|---|---|
| Expense | Reduces one account. Has a name, amount, category, date |
| Income | Increases one account (salary or anything else). Has a source name |
| Transfer | Moves money between two accounts, with an optional fee |
| Correction | Sets an account to its true balance |

- A transfer fee (for example a bKash cash-out charge) is recorded as its own
  expense in a "Fees" category, linked to the transfer.
- Entries can be added for any past date, and edited or deleted later.
- Amounts are stored as whole paisa to avoid rounding errors **(call)**.
- An optional note can be added to any entry.

## Fast entry

This is the most important screen in the project.

- "Add expense" is reachable in one tap from the Today page and the Money page.
- The form asks for amount, name, account and category, and defaults to today,
  the last-used account, and the category last used with that name **(call)**.
- Shortcuts: saved entries such as "Office rickshaw, 80, Cash, Travel". One tap
  records it for today; a long press lets the amount be changed first. The
  owner creates, edits and orders shortcuts.
- Typing a name suggests earlier entries with the same name **(call)**.

## Categories

- The owner creates, renames, merges and archives categories. Starting set
  **(call)**: Travel, Food, Study, Bills, Fees, Other.
- Each category has a colour and icon chosen from a set.

## Budgets

- A monthly budget amount can be set per category, and one for the month as a
  whole.
- A warning shows when spending reaches a percentage of the budget. The
  percentage is a setting, starting at 80 **(call)**. Reaching the warning
  level or exceeding the budget can send a reminder, using the owner's chosen
  channels.

## Lending and borrowing

- People the owner lends to or borrows from are kept as a list.
- "Lent" reduces an account and increases what that person owes. "Borrowed"
  does the reverse. Repayments, full or partial, move the money back.
- A page shows who owes the owner and whom the owner owes, with history per
  person.
- Loans are not counted as spending or income in reports **(call)**.

## Looking back

- Day view: the notebook page. That day's entries and totals.
- Month view: total spent, total income, spending by category, the largest
  categories, and each compared with the previous month (amount and
  percentage, up or down).
- Day-type view: average and total spending on each day type from the week
  pattern in settings (Workday versus Class day at the start).
- Any month can be opened. Entries can be filtered by account, category and
  text.

## Reminder

- A daily "log your spending" reminder at a time the owner sets, on the
  channels the owner chooses.
- It is skipped if at least one entry was already recorded that day **(call)**;
  this can be switched off so it always sends.

## Settings for this section

Accounts, categories, shortcuts, budgets and warning level, people, daily
reminder time and channels.

## Tests

Balance calculation across all four entry kinds, editing and deleting past
entries, transfer fees, loans, and month comparison figures.
