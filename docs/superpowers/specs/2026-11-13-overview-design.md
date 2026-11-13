# Personal apps: overview

Date: 2026-11-13
Status: awaiting owner approval

This is the entry document. The details live in four sibling files:

- [Foundation](2026-11-13-foundation-design.md): repo, login, design system, settings, reminders
- [Money](2026-11-13-money-design.md): expense tracker
- [Habits](2026-11-13-habits-design.md): routine and points tracker
- [Vault](2026-11-13-vault-design.md): education and work files

Throughout these documents, a line marked **(call)** is a decision made by the
designer, not by the owner. Everything unmarked came from the owner.

## Intent

One person's daily-life tools in one place, usable from an iPhone, a PC and a
laptop.

The owner works Saturday to Thursday and attends MS classes on Friday. Today
they track spending in a paper notebook that stays at home, so days away from
home get forgotten and writing it up is slow. They want routines enforced by
reminders and a points score. They study from two computers and want course
material and saved AI explanations reachable from either.

## Goals

1. Logging an expense takes seconds, from a phone, anywhere.
2. The app reminds the owner: to log spending daily, and when each routine item
   is due.
3. Month-end answers "where did my money go, and how does that compare to last
   month".
4. A daily score shows which routine items were done on time, late, or missed.
5. Course and work files, notes and links are organised the owner's way and
   open on any device.
6. Nothing is locked in code. Accounts, categories, point rules, routines,
   folders, fields and reminder times are all edited from one central settings
   area. What the owner described is the starting data, not a limit.
7. The interface looks and feels high-end, at the level of sites featured on
   Awwwards.

## Non-goals

- Other users, sharing, or sign-up. One account only.
- A native iOS or Android app.
- Reading bank or bKash transactions automatically.
- Syncing with Google Classroom, or calling any AI service.
- Microservices, or more than one database.
- Working without an internet connection, beyond showing the app shell **(call)**.

## Anti-goals

These make it a failure even if it technically works:

- Adding an expense is slower than writing it in the notebook.
- A reminder arrives late or not at all.
- So many emails that the owner starts ignoring them.
- Something the owner wants to change requires editing code.
- It looks like a generic dashboard template.

## Constraints

- Free to run for now. The owner has Heroku student credit and will use Vercel's
  free plan.
- One PostgreSQL database shared by everything.
- The owner's phone is an iPhone. Web push needs iOS 16.4 or newer and only
  works after the app is added to the home screen.
- The owner creates all outside accounts and supplies keys through local
  environment files. Keys are never pasted into chat or committed.

## How it gets made

Decided by the owner: Turborepo monorepo, Next.js front end, NestJS back end,
one database, Cloudflare R2 for files, Heroku for the back end, Vercel for the
front end, installable web app instead of a native app.

Proposed by the designer and accepted by the owner in conversation:

| Part | Choice |
|---|---|
| Package manager | pnpm |
| Front end | One Next.js app (App Router, TypeScript) with three sections |
| Database | PostgreSQL on Neon free plan, Prisma |
| Email | Resend |
| Phone notifications | Web push (VAPID) |
| Styling and motion | Tailwind CSS, Motion, GSAP, Lenis |
| Charts | Recharts, restyled |
| Login | One account with a password |

Hosting notes:

- Heroku: use a Basic dyno, which does not sleep. Eco dynos sleep and would
  delay reminders. Confirm current student credit and dyno prices at setup time.
- If the Heroku credit ends, the fallback is a free host kept awake by an
  outside timer service. The code must not depend on which host is used.

## Repo layout **(call)**

```
apps/
  web/        Next.js app: Today, Money, Habits, Vault, Settings
  api/        NestJS app: one module per area
packages/
  db/         Prisma schema, migrations, seed data
  shared/     Types and validation schemas used by web and api
  ui/         Design system components and tokens
  config/     Shared TypeScript, lint and Tailwind config
```

The three apps are sections of one installed app so there is one home-screen
icon, one login and one settings area. Each section's code is kept in its own
folder in `web` and its own module in `api`, so a section could be split into
its own app later.

## Build order

Agreed with the owner. Each stage is usable before the next begins and gets its
own implementation plan.

1. Foundation
2. Money
3. Habits
4. Vault

## Decisions made by the designer

Collected here so the owner can check them in one place. Each is explained in
the file named.

- One Next.js app with three sections, not three apps (this file)
- No offline entry in the first version (this file)
- A "Today" front page combining all three areas (Foundation)
- Dark theme only (Foundation)
- Browser talks to the back end through the Next.js domain (Foundation)
- Reminder checks run once a minute (Foundation)
- Account balances are calculated, never stored (Money)
- Daily logging reminder is skipped if entries already exist that day (Money)
- The habit day ends at 4:00 a.m., not midnight (Habits)
- Scoring rules for repeating items like water (Habits)
- Past days keep the points rules they were scored with (Habits)
- PowerPoint files download; they do not open in the app (Vault). The owner
  accepted "slides open inside the app", so this one narrows what was agreed.
- Search does not look inside PDF text (Vault)

## Left to the builder

Database table design, API route shapes, component structure, the exact
animations, and test layout. The documents say what must be true, not how to
code it.
