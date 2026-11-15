# Personal apps

One person's daily-life tools: Money, Habits and Vault, in one installable web
app. Design documents are in [docs/superpowers/specs](docs/superpowers/specs).

Built so far:

- The foundation: login, settings, reminders, installable app.
- Money: the day page (balances, one-tap shortcuts, entries, fix a balance), the month page
  (categories against last month, budgets, cost by kind of day, a filterable list), loans,
  budget warnings, a daily reminder to log spending, a CSV download, and every list editable
  under Settings, Money.
- Habits: the daily routine with one-tap ticks (on time, late or missed by the clock), a score
  against the day's target, a habit day that ends at 4 am, prayer times worked out for your
  location, skip days, reminders when things open, fall due or are about to close, an optional
  end-of-day summary, weekly and monthly progress with the weakest items and streaks, and the
  whole routine and its scoring rules editable under Settings, Habits.

Vault comes next.

## Layout

```
apps/web        Next.js front end
apps/api        NestJS back end
packages/db     Prisma schema, migrations, local database scripts
packages/shared Settings rules and reminder schedule maths, used by both apps
packages/ui     Design system ("bottle green and brass")
packages/config Shared TypeScript and lint config
```

## Running it on your computer

You need Node 22 and pnpm. Nothing else: the database is a real PostgreSQL
that runs from inside the project.

First time only:

```bash
pnpm install
```

Copy `.env.example` to `.env` and set:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:54329/personal_apps
DEV_OWNER_EMAIL=owner@localhost.test
DEV_OWNER_PASSWORD=<any password of 10 or more characters>
```

Then, each in its own terminal:

```bash
pnpm dev:db
```

```bash
pnpm --filter @pa/db migrate:deploy
```

```bash
pnpm build
```

```bash
node apps/api/scripts/create-dev-owner.js
```

```bash
pnpm --filter api start
```

```bash
pnpm --filter web dev
```

Open http://localhost:3000 and log in with the `DEV_OWNER_*` values.

Phone notifications also need `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
`VAPID_SUBJECT` in `.env`. Generate the keys with
`pnpm --filter api exec web-push generate-vapid-keys`.

## Checks

```bash
pnpm test
```

```bash
pnpm lint
```

```bash
pnpm build
```

Back-end tests start their own throwaway database on port 54330.

## Changing the database

Edit `packages/db/prisma/schema.prisma`, then create a migration against the
local database:

```bash
pnpm --filter @pa/db migrate:dev:local --name <what-changed>
```

Stop `pnpm dev:db` first; that command starts the database itself.

## Putting it online

See [docs/setup/accounts.md](docs/setup/accounts.md).
