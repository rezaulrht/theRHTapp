# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, installable web app where the owner can log in, change settings, and receive a test reminder by phone notification and by email.

**Architecture:** A pnpm/Turborepo monorepo. `apps/web` (Next.js) is the only origin the browser talks to and forwards `/api/*` to `apps/api` (NestJS). Pure logic (settings schema, schedule maths) lives in `packages/shared` so both apps use it; the database schema lives in `packages/db`; the design system in `packages/ui`.

**Tech Stack:** pnpm, Turborepo, TypeScript, Next.js (App Router), NestJS, Prisma, PostgreSQL (Neon), Zod, Luxon, argon2, web-push, Resend, Tailwind CSS, Motion, Lenis, Vitest (packages and web), Jest (api).

**Spec:** `docs/superpowers/specs/2026-11-13-overview-design.md` and `docs/superpowers/specs/2026-11-13-foundation-design.md`. Read both before starting any task.

## Global Constraints

- Node 22 or newer; pnpm 9 or newer. Use the latest stable Next.js and NestJS; check their current docs before scaffolding (file conventions change between majors, for example the Next.js request-interception file).
- Package scope is `@pa/` (`@pa/shared`, `@pa/db`, `@pa/ui`, `@pa/config`).
- One PostgreSQL database. All times stored in UTC, shown in the `general.timezone` setting.
- Nothing the owner might change is a constant in code. It is a setting with a default in `packages/shared/src/settings.ts`.
- Secrets come only from environment variables. Never commit `.env`; keep `.env.example` current in every task that adds a variable.
- The browser never calls the Heroku origin directly. All requests go to `/api/*` on the web origin.
- API routes are all under the global prefix `api`.
- Calculations (schedules, later money and scores) run on the back end or in `@pa/shared`; the front end displays results.
- Design tokens: ground `#0E2620`, panel `#143229`, ivory `#F1EBDD`, sage `#9FB3A8`, brass `#C8A662`, alert `#E8795F`. Display and numbers: Bodoni Moda. Text: Hanken Grotesk. Dark theme only.
- Interface copy: sentence case, plain verbs, no all-caps labels. A button names what it does ("Save changes", "Send test reminder").
- Motion never delays a task and is disabled under `prefers-reduced-motion`.
- Commit at the end of every task with a conventional-commit message.

## Review Focus

1. A push subscription that the phone has revoked (push service answers 404 or 410): the subscription is deleted, email still sends, the tick does not throw. Test in Task 9.
2. Resend or the push service is down: the delivery is recorded as `failed` with the error, the reminder still advances to its next occurrence, other reminders in the same tick still send. Test in Task 8.
3. Two ticks overlap, or the dyno restarts mid-minute: no occurrence is sent twice. Test in Task 8.
4. The session expires while the app is open: API answers 401 and the web app sends the owner to `/login` and back to the page they were on after login. Test in Task 11.
5. A settings change with a bad value (unknown time zone, `25:99` as a time, a week pattern naming a day type that does not exist): 400 with the field named, nothing saved. Tests in Tasks 2 and 7.

---

## File map

```
package.json, pnpm-workspace.yaml, turbo.json, .gitignore, .env.example, Procfile
packages/config/      tsconfig.base.json, eslint.config.mjs, tailwind-preset.ts
packages/shared/src/  settings.ts, schedule.ts, reminder.ts, index.ts
packages/db/          prisma/schema.prisma, src/index.ts
packages/ui/src/      tokens.css, Button.tsx, Field.tsx, Panel.tsx, Toggle.tsx,
                      Select.tsx, Amount.tsx, AppNav.tsx, index.ts
apps/api/src/         main.ts, app.module.ts, env.ts
  prisma/             prisma.module.ts, prisma.service.ts
  health/             health.controller.ts
  auth/               lockout.ts, auth.service.ts, auth.controller.ts,
                      session.guard.ts, public.decorator.ts, setup-owner.ts
  settings/           settings.service.ts, settings.controller.ts
  reminders/          reminder-engine.service.ts, reminder-cron.service.ts,
                      channel-sender.ts, push.sender.ts, email.sender.ts,
                      push.controller.ts, reminders.controller.ts
  export/             export.service.ts, export.controller.ts
apps/web/             next.config.ts, public/sw.js, public/icons/*
  src/app/            layout.tsx, manifest.ts, login/page.tsx, offline/page.tsx
  src/app/(app)/      layout.tsx, today/, money/, habits/, vault/, settings/
  src/lib/            api.ts, push.ts
  src/components/     InstallGuide.tsx, OfflineBanner.tsx, SmoothScroll.tsx,
                      PageTransition.tsx
docs/setup/accounts.md
```

---

### Task 1: Monorepo scaffold

**Files:** Create root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.env.example`, `packages/config/*`, and an empty `packages/shared` with one passing test.

**Interfaces:**
- Produces: root scripts `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm dev` (each runs the matching turbo task); `@pa/config/tsconfig.base.json` (strict, `moduleResolution: bundler`); workspace globs `apps/*` and `packages/*`.

- [ ] **Step 1:** Run `node -v` and `pnpm -v`. Expected: Node 22+ and pnpm 9+. If pnpm is missing, run `corepack enable`.
- [ ] **Step 2:** Run `git init -b main` in `E:\personal_apps`.
- [ ] **Step 3:** Create the root files. `.gitignore` must include `node_modules`, `.env`, `.env.*` (but not `.env.example`), `.next`, `dist`, `.turbo`, `.superpowers/`.
- [ ] **Step 4:** Create `packages/config` and `packages/shared` (Vitest) with `src/index.ts` and a placeholder test `expect(true).toBe(true)`.
- [ ] **Step 5:** Run `pnpm install` then `pnpm build && pnpm lint && pnpm test`. Expected: all three succeed.
- [ ] **Step 6:** Commit: `chore: scaffold monorepo`. Include the existing `docs/` folder in this commit.

### Task 2: Settings schema and defaults

**Files:** Create `packages/shared/src/settings.ts`, `packages/shared/src/settings.test.ts`. Modify `packages/shared/src/index.ts`.

**Interfaces:**
- Produces:
  - `settingsSchema`: a Zod object with exactly these keys.
  - `type Settings = z.infer<typeof settingsSchema>`
  - `defaultSettings: Settings`
  - `parseSettingsPatch(current: Settings, patch: unknown): { ok: true; value: Settings } | { ok: false; errors: { path: string; message: string }[] }` — merges the patch over `current`, validates the whole result.

| Key | Shape | Default |
|---|---|---|
| `general.timezone` | IANA zone name; must be accepted by Luxon | `Asia/Dhaka` |
| `general.location` | `{ label: string; lat: number; lng: number }` | `{ label: 'Dhaka', lat: 23.8103, lng: 90.4125 }` |
| `general.currency` | `{ symbol: string; code: string }` | `{ symbol: '৳', code: 'BDT' }` |
| `general.dayTypes` | `{ id: string; name: string }[]`, at least one, unique ids | `[{ id: 'workday', name: 'Workday' }, { id: 'classday', name: 'Class day' }]` |
| `general.weekPattern` | record of `sun`…`sat` to a day type id that exists in `general.dayTypes` | `fri: 'classday'`, all others `'workday'` |
| `general.notificationEmail` | email or empty string | `''` |
| `general.quietHours` | `{ enabled: boolean; start: 'HH:mm'; end: 'HH:mm' }` | `{ enabled: false, start: '23:30', end: '05:00' }` |

- [ ] **Step 1: Write the failing tests**

```ts
it('defaults are valid', () => {
  expect(settingsSchema.parse(defaultSettings)).toEqual(defaultSettings);
});
it('accepts a partial patch', () => {
  const r = parseSettingsPatch(defaultSettings, { 'general.timezone': 'Asia/Karachi' });
  expect(r.ok && r.value['general.timezone']).toBe('Asia/Karachi');
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
  if (!r.ok) expect(r.errors.map(e => e.path)).toContain(path);
});
it('rejects removing a day type still used by the week pattern', () => {
  const r = parseSettingsPatch(defaultSettings, { 'general.dayTypes': [{ id: 'workday', name: 'Workday' }] });
  expect(r.ok).toBe(false);
});
```

- [ ] **Step 2:** Run `pnpm --filter @pa/shared test`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `settings.ts`. Unknown keys are an error (strict object). Cross-field checks use `superRefine`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(shared): settings schema and defaults`.

### Task 3: Schedule calculations

**Files:** Create `packages/shared/src/schedule.ts`, `packages/shared/src/schedule.test.ts`, `packages/shared/src/reminder.ts`. Modify `index.ts`.

**Interfaces:**
- Produces, in `reminder.ts`:

```ts
export type Channel = 'push' | 'email';
export type Schedule =
  | { kind: 'once'; at: string }                       // ISO instant, UTC
  | { kind: 'weekly'; days: number[]; time: string; offsetMinutes?: number }
  | { kind: 'interval'; days: number[]; start: string; end: string; everyMinutes: number };
export const scheduleSchema: z.ZodType<Schedule>;
```

  `days` uses 0 = Sunday … 6 = Saturday and must be non-empty. `time`, `start`, `end` are `HH:mm` in the settings time zone. `offsetMinutes` may be negative ("10 minutes before"). `everyMinutes` is 5 or more. `end` must be later than `start`.
- Produces, in `schedule.ts`:
  - `nextOccurrence(schedule: Schedule, after: Date, timeZone: string): Date | null` — the first occurrence strictly later than `after`; `null` when a `once` schedule is in the past.
  - `isInQuietHours(at: Date, quiet: Settings['general.quietHours'], timeZone: string): boolean` — handles ranges that cross midnight; `false` when disabled.

- [ ] **Step 1: Write the failing tests** (Dhaka is UTC+6; 2026-11-13 is a Friday)

```ts
const tz = 'Asia/Dhaka';
const d = (iso: string) => new Date(iso);
it('once: returns the instant if still ahead, else null', () => {
  const s = { kind: 'once', at: '2026-11-13T04:00:00Z' } as const;
  expect(nextOccurrence(s, d('2026-11-13T03:59:00Z'), tz)).toEqual(d('2026-11-13T04:00:00Z'));
  expect(nextOccurrence(s, d('2026-11-13T04:00:00Z'), tz)).toBeNull();
});
it('weekly: 05:30 Dhaka on Sat-Thu skips Friday', () => {
  const s = { kind: 'weekly', days: [0,1,2,3,4,6], time: '05:30' } as const;
  // Thursday 12 Nov 06:00 Dhaka -> next is Saturday 14 Nov 05:30 Dhaka = Fri 23:30Z
  expect(nextOccurrence(s, d('2026-11-12T00:00:00Z'), tz)).toEqual(d('2026-11-13T23:30:00Z'));
});
it('weekly: negative offset fires before the time', () => {
  const s = { kind: 'weekly', days: [5], time: '08:30', offsetMinutes: -10 } as const;
  expect(nextOccurrence(s, d('2026-11-12T12:00:00Z'), tz)).toEqual(d('2026-11-13T02:20:00Z'));
});
it('interval: steps inside the window then rolls to the next allowed day', () => {
  const s = { kind: 'interval', days: [5], start: '09:00', end: '12:00', everyMinutes: 90 } as const;
  expect(nextOccurrence(s, d('2026-11-13T03:00:00Z'), tz)).toEqual(d('2026-11-13T04:30:00Z')); // 10:30
  expect(nextOccurrence(s, d('2026-11-13T04:30:00Z'), tz)).toEqual(d('2026-11-13T06:00:00Z')); // 12:00
  expect(nextOccurrence(s, d('2026-11-13T06:00:00Z'), tz)).toEqual(d('2026-11-20T03:00:00Z')); // next Fri 09:00
});
it('quiet hours crossing midnight', () => {
  const q = { enabled: true, start: '23:30', end: '05:00' };
  expect(isInQuietHours(d('2026-11-13T18:00:00Z'), q, tz)).toBe(true);   // 00:00 Dhaka
  expect(isInQuietHours(d('2026-11-12T23:00:00Z'), q, tz)).toBe(false);  // 05:00 Dhaka, end is exclusive
  expect(isInQuietHours(d('2026-11-13T18:00:00Z'), { ...q, enabled: false }, tz)).toBe(false);
});
it('scheduleSchema rejects empty days, bad times, end before start, everyMinutes under 5', () => { /* four safeParse cases, each .success === false */ });
```

- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement with Luxon. Build candidate instants in the zone, not by adding fixed milliseconds, so the functions stay correct in zones with daylight saving.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(shared): reminder schedule calculations`.

### Task 4: Database schema

**Files:** Create `packages/db/prisma/schema.prisma`, `packages/db/src/index.ts`, `packages/db/package.json`. Modify `.env.example` (`DATABASE_URL`, `DATABASE_URL_TEST`).

**Interfaces:**
- Produces: `@pa/db` exporting `PrismaClient` and the generated types; scripts `migrate:dev`, `migrate:deploy`, `generate`.
- Models (ids are `cuid()` strings unless stated; every model has `createdAt`):

| Model | Fields |
|---|---|
| `User` | `email` unique, `passwordHash`, `failedAttempts Int @default(0)`, `lockedUntil DateTime?` |
| `Session` | `tokenHash` unique (SHA-256 hex of the cookie value), `userId`, `expiresAt`, `lastUsedAt` |
| `Setting` | `key String @id`, `value Json`, `updatedAt` |
| `PushSubscription` | `endpoint` unique, `p256dh`, `auth`, `userAgent String?` |
| `Reminder` | `ownerType String`, `ownerId String?`, `title`, `body`, `url`, `schedule Json`, `channels String[]`, `ignoreQuietHours Boolean @default(false)`, `enabled Boolean @default(true)`, `nextFireAt DateTime?`, `updatedAt`; index on `(enabled, nextFireAt)` and on `(ownerType, ownerId)` |
| `ReminderDelivery` | `reminderId` (cascade delete), `occurrenceAt DateTime`, `channel String`, `status String` (`sent`, `failed`, `missed`, `suppressed`), `error String?`; `@@unique([reminderId, occurrenceAt, channel])` |

- [ ] **Step 1:** Write the schema and scripts.
- [ ] **Step 2:** The owner must have created the Neon project with two databases (see Task 14's checklist, which can be done early). With `DATABASE_URL` set in `.env`, run `pnpm --filter @pa/db migrate:dev --name foundation`. Expected: migration created and applied.
- [ ] **Step 3:** Run `pnpm build`. Expected: `@pa/db` builds and exports the client.
- [ ] **Step 4:** Commit: `feat(db): foundation schema`.

If the Neon databases do not exist yet, stop and ask the owner; do not substitute another database.

### Task 5: API bootstrap

**Files:** Create `apps/api` (Nest CLI scaffold, then trimmed), `src/env.ts`, `src/prisma/*`, `src/health/health.controller.ts`, `test/helpers.ts`.

**Interfaces:**
- Produces:
  - `env`: parsed with Zod at startup; the process exits with a readable message naming any missing variable. Variables: `DATABASE_URL`, `PORT` (default 4000), `NODE_ENV`, `SESSION_COOKIE_NAME` (default `pa_session`).
  - `PrismaService` (global module) extending `PrismaClient`.
  - `GET /api/health` → `200 { status: 'ok' }`.
  - `test/helpers.ts`: `createTestApp(): Promise<INestApplication>` using `DATABASE_URL_TEST`, running `migrate deploy` once per run and truncating all tables before each test; `loginAsOwner(app): Promise<string>` returning a cookie header (implemented in Task 6, declared here as a stub that throws).

- [ ] **Step 1:** Write `test/health.e2e-spec.ts`: `GET /api/health` returns 200 and `{ status: 'ok' }`.
- [ ] **Step 2:** Run `pnpm --filter api test:e2e`. Expected: FAIL.
- [ ] **Step 3:** Scaffold and implement. Set the global prefix `api`, a global `ValidationPipe`-equivalent that validates bodies with Zod schemas from `@pa/shared`, and `cookie-parser`.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): bootstrap with health check`.

### Task 6: Login

**Files:** Create everything under `apps/api/src/auth/`, `test/auth.e2e-spec.ts`, `src/auth/lockout.spec.ts`. Modify `test/helpers.ts`, `app.module.ts`, `apps/api/package.json` (script `setup:owner`).

**Interfaces:**
- Produces:
  - `lockout.ts`: `registerFailure(s: { failedAttempts: number; lockedUntil: Date | null }, now: Date): { failedAttempts: number; lockedUntil: Date | null }` and `isLocked(s, now): boolean`. Constants `MAX_ATTEMPTS = 5`, `LOCK_MINUTES = 15`.
  - `POST /api/auth/login` body `{ email, password }` → `204` and sets the cookie; `401 { message: 'Email or password is wrong' }`; `423 { message, retryAfterSeconds }` when locked.
  - `POST /api/auth/logout` → `204`, deletes the session, clears the cookie.
  - `GET /api/auth/me` → `200 { email }`.
  - `POST /api/auth/change-password` body `{ currentPassword, newPassword }` → `204`; new password at least 10 characters; deletes every other session.
  - `SessionGuard` registered globally; `@Public()` exempts a route. Health and login are public. Everything else answers `401` without a valid session.
  - Cookie: name from `env.SESSION_COOKIE_NAME`, value 32 random bytes base64url, `httpOnly`, `sameSite: 'lax'`, `secure` when `NODE_ENV === 'production'`, `path: '/'`, 30 days. When a session is used and `lastUsedAt` is more than 24 hours old, extend `expiresAt` to 30 days from now and re-send the cookie.
  - `pnpm --filter api setup:owner`: prompts for email and password (hidden input), creates the single `User`. If a user exists it refuses, unless run with `--reset-password`, which sets a new password and deletes all sessions.
  - `loginAsOwner(app)` in test helpers: creates a user `owner@example.test` and returns the cookie header.
- Hash passwords with `argon2` (argon2id defaults). Compare with the same time cost whether or not the email exists.

- [ ] **Step 1: Write the failing tests**

```ts
// lockout.spec.ts
it('locks on the fifth failure for 15 minutes', () => {
  let s = { failedAttempts: 0, lockedUntil: null as Date | null };
  const now = new Date('2026-11-13T00:00:00Z');
  for (let i = 0; i < 4; i++) s = registerFailure(s, now);
  expect(isLocked(s, now)).toBe(false);
  s = registerFailure(s, now);
  expect(s.lockedUntil).toEqual(new Date('2026-11-13T00:15:00Z'));
  expect(isLocked(s, new Date('2026-11-13T00:14:59Z'))).toBe(true);
  expect(isLocked(s, new Date('2026-11-13T00:15:00Z'))).toBe(false);
});
```

  `auth.e2e-spec.ts` cases: correct login returns 204 with an httpOnly cookie; `me` works with it and is 401 without; wrong password is 401; the sixth attempt after five wrong ones is 423 even with the right password; a successful login resets the counter; logout makes the old cookie 401; an expired session is 401; change-password rejects a 9-character password, accepts a valid one, and a second session created earlier becomes 401; an unknown route under `/api` without a cookie is 401 not 404.

- [ ] **Step 2:** Run both test commands. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): single-owner login with lockout`.

### Task 7: Settings API

**Files:** Create `apps/api/src/settings/*`, `test/settings.e2e-spec.ts`.

**Interfaces:**
- Consumes: `settingsSchema`, `defaultSettings`, `parseSettingsPatch` from `@pa/shared`.
- Produces:
  - `SettingsService.getAll(): Promise<Settings>` — stored rows merged over `defaultSettings`.
  - `SettingsService.get<K extends keyof Settings>(key: K): Promise<Settings[K]>`.
  - `SettingsService.patch(patch: unknown): Promise<Settings>` — throws `BadRequestException({ errors })` on failure; writes only the changed keys, in one transaction.
  - `GET /api/settings` → `Settings`; `PATCH /api/settings` → `Settings`.

- [ ] **Step 1:** Write e2e tests: fresh database returns exactly `defaultSettings`; patching the time zone persists across a second GET; each invalid patch from Task 2's table returns 400 with the path in `errors` and a following GET is unchanged; both routes are 401 without a cookie.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): settings`.

### Task 8: Reminder engine

**Files:** Create `apps/api/src/reminders/reminder-engine.service.ts`, `reminder-cron.service.ts`, `channel-sender.ts`, `reminder-engine.spec.ts` (runs against the test database).

**Interfaces:**
- Consumes: `nextOccurrence`, `isInQuietHours`, `Schedule`, `Channel`, `scheduleSchema`; `SettingsService`.
- Produces:

```ts
// channel-sender.ts
export interface ReminderMessage { title: string; body: string; url: string }
export interface ChannelSender { readonly channel: Channel; send(m: ReminderMessage): Promise<void> }
export const CHANNEL_SENDERS = Symbol('CHANNEL_SENDERS'); // injected as ChannelSender[]

// reminder-engine.service.ts
export interface ReminderInput {
  ownerType: 'system' | 'money' | 'habit' | 'vault'; ownerId?: string;
  title: string; body: string; url: string;
  schedule: Schedule; channels: Channel[]; ignoreQuietHours?: boolean; enabled?: boolean;
}
create(input: ReminderInput, now?: Date): Promise<Reminder>   // validates schedule, sets nextFireAt
update(id: string, input: Partial<ReminderInput>, now?: Date): Promise<Reminder> // recomputes nextFireAt
remove(id: string): Promise<void>
removeForOwner(ownerType: string, ownerId: string): Promise<void>
tick(now: Date): Promise<void>
```

- `tick` rules, in order, for each enabled reminder with `nextFireAt <= now`, where `occurrence = nextFireAt`:
  1. For each channel, insert the `ReminderDelivery` row first. If the unique constraint rejects it, skip that channel (already handled).
  2. If `now - occurrence` is more than 30 minutes, the row's status is `missed` and nothing is sent.
  3. Else if quiet hours apply at `occurrence` and `ignoreQuietHours` is false, status `suppressed`.
  4. Else call the sender; status `sent`, or `failed` with the error message if it throws.
  5. Set `nextFireAt = nextOccurrence(schedule, occurrence, tz)`. If that is still not later than `now`, keep advancing until it is, recording each skipped occurrence as `missed`, capped at 500 iterations.
  A failure handling one reminder never stops the others.
- `ReminderCronService`: runs `tick(new Date())` every minute with `@nestjs/schedule`, and once on application bootstrap. Skips a run if the previous one is still in progress. Disabled when `NODE_ENV === 'test'`.

- [ ] **Step 1: Write the failing tests** using two fake senders that record calls and can be told to throw.

  Cases: a due `once` reminder sends on both channels, records two `sent` rows, and ends with `nextFireAt` null; calling `tick` twice with the same `now` sends once (Review Focus 3); two `tick` calls run concurrently with `Promise.all` send once; an occurrence 31 minutes old records `missed` and sends nothing, one 29 minutes old sends; with quiet hours on, a 00:00 Dhaka reminder is `suppressed`, and the same reminder with `ignoreQuietHours` is `sent`; when the email fake throws, its row is `failed` with the message, push is `sent`, the weekly reminder's `nextFireAt` has moved forward, and a second due reminder in the same tick still sends (Review Focus 2); a weekly reminder left untouched for three days records its skipped occurrences as `missed` and lands on a future `nextFireAt`; `create` with `days: []` rejects; a disabled reminder never fires; `removeForOwner` deletes only that owner's reminders.

- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): reminder engine`.

### Task 9: Delivery channels, test reminder, export

**Files:** Create `reminders/push.sender.ts`, `email.sender.ts`, `push.controller.ts`, `reminders.controller.ts`, `export/*`, matching spec files. Modify `env.ts`, `.env.example`.

**Interfaces:**
- New variables: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a `mailto:` address), `RESEND_API_KEY`, `EMAIL_FROM`, `WEB_ORIGIN` (used to build absolute links in emails).
- Produces:
  - `PushSender` (`channel: 'push'`): sends `{ title, body, url }` as JSON to every `PushSubscription` with the `web-push` package. On a 404 or 410 from the push service it deletes that subscription and carries on. It throws only if there are no subscriptions (`No device is subscribed`) or every send failed.
  - `EmailSender` (`channel: 'email'`): sends through Resend to the `general.notificationEmail` setting; throws `No notification email is set` when empty. Subject is the title; the body is the text plus a link to `WEB_ORIGIN + url`.
  - `GET /api/push/public-key` → `{ key }`.
  - `POST /api/push/subscriptions` body `{ endpoint, keys: { p256dh, auth } }` → `204`; upserts by endpoint.
  - `DELETE /api/push/subscriptions` body `{ endpoint }` → `204`.
  - `POST /api/reminders/test` → creates a `system` reminder (`once`, at now, both channels, `ignoreQuietHours: true`, title `Test reminder`, body `Reminders are working.`, url `/settings/notifications`), runs `tick`, and returns `{ deliveries: { channel, status, error }[] }`.
  - `GET /api/reminders/deliveries?limit=50` → latest deliveries with the reminder title, newest first; limit capped at 200.
  - `export/export.service.ts`: `interface ExportContributor { key: string; export(): Promise<unknown> }`, token `EXPORT_CONTRIBUTORS`; later stages register their own. `GET /api/export` → a JSON attachment named `personal-apps-YYYY-MM-DD.json` containing `{ exportedAt, settings, reminders }` plus one property per contributor. It never includes password hashes, sessions or push keys.

- [ ] **Step 1:** Write tests with the `web-push` and Resend clients mocked. Push: three subscriptions where one answers 410 → two sends succeed, the dead one is deleted, no throw (Review Focus 1); no subscriptions → throws. Email: empty address → throws; otherwise called with the right recipient and an absolute link. Test endpoint: returns one row per channel with real statuses, and with no subscription and no email both are `failed` with the messages above and the response is still 200. Export: contains settings and reminders and none of `passwordHash`, `tokenHash`, `p256dh`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Generate VAPID keys with `npx web-push generate-vapid-keys` and document that command in `.env.example`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): push and email delivery, test reminder, export`.

### Task 10: Design system

**Files:** Create `packages/ui/src/*`, `packages/config/tailwind-preset.ts`, component tests.

**Interfaces:**
- Produces:
  - `tokens.css`: CSS variables `--ground`, `--panel`, `--ivory`, `--sage`, `--brass`, `--alert` with the values in Global Constraints, plus `--hairline` (brass at 33% opacity) and a spacing and radius scale. The Tailwind preset maps colour names `ground`, `panel`, `ivory`, `sage`, `brass`, `alert` and font families `display` and `sans` to variables `--font-display` and `--font-sans`.
  - Components, all forwarding refs and accepting `className`: `Button` (`variant: 'primary' | 'outline' | 'quiet'`, `loading?: boolean`), `Field` (label, input, `error?: string`, linked with `aria-describedby`), `Select`, `Toggle` (a real checkbox underneath), `Panel`, `Amount` (`value: number`, `currency?: string`, `animate?: boolean`; tabular figures in the display face; counts up over 600 ms when `animate` and motion is allowed), `AppNav` (`items: { href, label, icon }[]`, `current: string`; bottom bar under 768 px, side rail above).
  - Visible keyboard focus on every interactive component: a 2 px brass outline with offset.
- Reference for look and proportion: `.superpowers/brainstorm/394-1794586654/content/visual-style.html`, option A. Primary button is the brass-outline pill from that mockup.

- [ ] **Step 1:** Write tests (Vitest, Testing Library): `Field` shows its error and links it to the input; `Button` with `loading` is disabled and announces busy; `Toggle` changes on click and on Space; `Amount` renders `42,350` for `42350` and renders the final value immediately when reduced motion is set; `AppNav` marks the current item with `aria-current="page"`.
- [ ] **Step 2:** Run `pnpm --filter @pa/ui test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): green and brass design system`.

### Task 11: Web shell and login

**Files:** Create `apps/web` (create-next-app, App Router, TypeScript, Tailwind, `src/`), then the files in the file map except settings pages and PWA files.

**Interfaces:**
- Consumes: `@pa/ui`, `@pa/shared` types, the API routes from Tasks 6 and 7.
- New variable: `API_ORIGIN` (for example `http://localhost:4000`), server-side only.
- Produces:
  - `next.config.ts` rewrite: `/api/:path*` → `${API_ORIGIN}/api/:path*`.
  - Fonts loaded with `next/font/google` (Bodoni Moda, Hanken Grotesk) and exposed as `--font-display` and `--font-sans`.
  - `src/lib/api.ts`: `api<T>(path: string, init?: RequestInit): Promise<T>` — prefixes `/api`, sends JSON, throws `ApiError { status, message, errors? }`. On a 401 in the browser it navigates to `/login?next=<current path>`.
  - Request interception (the file convention for the installed Next.js version): any path under the `(app)` group without the session cookie redirects to `/login?next=…`; `/login` with a cookie redirects to `/today`. This is a convenience check only; the API remains the authority.
  - `/login`: email and password, "Log in" button, shows the 401 message inline, and for 423 shows "Too many attempts. Try again in N minutes." After success it goes to `next` if that is a same-origin path, otherwise `/today`.
  - `(app)/layout.tsx`: `AppNav` with Today, Money, Habits, Vault, Settings; `SmoothScroll` (Lenis); `PageTransition` (Motion, a short cross-fade with a slight rise, skipped under reduced motion).
  - `/today`: greeting with today's date in the settings time zone, and three blocks for Money, Habits and Vault that each say what will appear there once that section is built. `/money`, `/habits`, `/vault`: a title and one sentence saying the section is not built yet.
  - `/` redirects to `/today`.

- [ ] **Step 1:** Write tests: `api()` throws `ApiError` with the server message on a 400; on a 401 it sets `location` to `/login?next=/settings` when called from `/settings` (Review Focus 4); the login page shows the inline message for 401 and the minutes text for 423; `next=https://evil.example` is ignored in favour of `/today`.
- [ ] **Step 2:** Run `pnpm --filter web test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Run `pnpm dev`, create the owner with `pnpm --filter api setup:owner`, and check by hand in a browser at phone width and desktop width: logging in works, the nav switches form at 768 px, pages cross-fade, and the look matches mockup A. Take screenshots for the owner.
- [ ] **Step 6:** Commit: `feat(web): app shell and login`.

### Task 12: Settings pages

**Files:** Create `apps/web/src/app/(app)/settings/` with `layout.tsx`, `general/page.tsx`, `notifications/page.tsx`, `security/page.tsx`, `data/page.tsx`, and tests.

**Interfaces:**
- Consumes: `GET/PATCH /api/settings`, `POST /api/auth/change-password`, `POST /api/auth/logout`, `POST /api/reminders/test`, `GET /api/reminders/deliveries`, `GET /api/export`.
- Produces: the settings layout has a sub-navigation with a slot later stages add to (`Money`, `Habits`, `Vault` entries are added by those stages; export a `settingsSections` array from `settings/sections.ts` that they append to).
  - **General:** time zone (searchable list of IANA zones), location (label, latitude, longitude), currency symbol and code, day types (add, rename, remove; removing one in use is blocked with the server's message), week pattern (a day type picker for each of the seven days, Saturday first).
  - **Notifications:** notification email, quiet hours (toggle, start, end), "Send test reminder" button showing each channel's result in plain words, and a list of the latest 50 deliveries with time, title, channel and result. The enable-notifications control is added in Task 13.
  - **Security:** change password; "Log out".
  - **Data:** "Download my data" (the export).
  - Each form saves with a "Save changes" button, shows field errors from the server next to the field named in `errors[].path`, and confirms with "Saved".

- [ ] **Step 1:** Write tests: the general form sends only changed keys; a server error for `general.quietHours.start` appears beside the start field; the test-reminder result renders `sent` as "Sent" and `failed` with its reason.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS. Then check each page by hand at phone width.
- [ ] **Step 5:** Commit: `feat(web): central settings`.

### Task 13: Installable app and phone notifications

**Files:** Create `apps/web/src/app/manifest.ts`, `public/sw.js`, `public/icons/` (192, 512, maskable 512, apple-touch 180), `src/app/offline/page.tsx`, `src/lib/push.ts`, `src/components/InstallGuide.tsx`, `OfflineBanner.tsx`. Modify the notifications settings page and the root layout.

**Interfaces:**
- Produces:
  - Manifest: `name` "Personal", `short_name` "Personal", `display: 'standalone'`, `start_url: '/today'`, `background_color` and `theme_color` `#0E2620`. The app name is a placeholder the owner can change; it is one string in `manifest.ts`.
  - `sw.js`: on `push`, shows a notification with the payload's `title` and `body` and stores `url` in `data`; on `notificationclick`, focuses an open window and navigates it to `url`, or opens a new one; on a failed navigation request, serves the cached `/offline` page. It caches nothing else.
  - `src/lib/push.ts`: `pushState(): Promise<'unsupported' | 'needs-install' | 'default' | 'denied' | 'subscribed'>`, `enablePush(): Promise<void>` (asks permission, subscribes with the key from `/api/push/public-key`, posts the subscription), `disablePush(): Promise<void>`. `needs-install` is returned on iOS when the page is not running standalone.
  - `InstallGuide`: shown on the Today page on iOS Safari when not standalone; three steps (tap Share, choose "Add to Home Screen", open the app from the home screen); dismissible, remembered in `localStorage`.
  - Notifications settings: a control driven by `pushState()` — "Turn on notifications on this device" when `default`; the install guide when `needs-install`; how to re-allow in iOS settings when `denied`; "Notifications are on for this device" with a turn-off button when `subscribed`; a short explanation when `unsupported`. Permission is requested only from that button's click handler.
  - `OfflineBanner`: a bar reading "No connection" while `navigator.onLine` is false.

- [ ] **Step 1:** Write tests for `pushState()` across the five states with mocked browser APIs, and for `InstallGuide` visibility (iOS and not standalone shows it; standalone hides it; dismissed stays hidden).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Generate the icons from a simple brass monogram on the ground colour.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** In desktop Chrome against `pnpm dev`: enable notifications, press "Send test reminder", confirm the notification appears and clicking it opens `/settings/notifications`. Turn the network off and confirm the offline page and banner.
- [ ] **Step 6:** Commit: `feat(web): installable app and push notifications`.

### Task 14: Deployment and acceptance

**Files:** Create `Procfile`, `docs/setup/accounts.md`. Modify root `package.json`, `.env.example`.

**Interfaces:**
- Produces:
  - `Procfile`: `release: pnpm --filter @pa/db migrate:deploy` and `web: node apps/api/dist/main.js`.
  - Root script `heroku-postbuild` that builds only the API and what it depends on. The API listens on `process.env.PORT`.
  - Vercel project settings documented: root directory `apps/web`, install command run from the repo root, `API_ORIGIN` set to the Heroku app URL.
  - `docs/setup/accounts.md`: a numbered checklist for the owner covering Neon (one project, databases `personal_apps` and `personal_apps_test`), Resend (API key, a verified sender or the Resend test sender), VAPID key generation, Heroku (create app, **Basic** dyno not Eco, Node buildpack, config vars), Vercel (import repo, settings above), then running `setup:owner` against production. It lists every environment variable, which side it belongs to, and where its value comes from. It notes that Cloudflare R2 is not needed until the Vault stage, and that Heroku credit and dyno prices should be confirmed on Heroku's site.

- [ ] **Step 1:** Write the files. Confirm `pnpm build && pnpm lint && pnpm test` passes from a clean clone.
- [ ] **Step 2:** Give the owner `docs/setup/accounts.md`. The owner creates the accounts and sets the variables; the implementer does not create accounts or handle the owner's passwords. A GitHub repository is needed for Vercel and Heroku deploys; pushing to one requires the owner's go-ahead.
- [ ] **Step 3:** After the owner deploys, verify `GET https://<vercel-domain>/api/health` returns `{ "status": "ok" }`.
- [ ] **Step 4:** Acceptance, done with the owner on their iPhone, matching the spec's definition of done:
  1. Open the Vercel address in Safari; the install guide appears.
  2. Add to Home Screen; open from the icon; it runs full-screen.
  3. Log in.
  4. Change the time zone in settings, reload, and see it kept; change it back.
  5. Set the notification email, turn on notifications for the device.
  6. Press "Send test reminder": a notification arrives on the phone and an email arrives; both show as "Sent".
  7. Lock the phone, wait for a scheduled reminder created one or two minutes ahead (add a temporary `once` reminder through the test endpoint's code path or a database row), and confirm it arrives within a minute of its time.
- [ ] **Step 5:** Commit: `chore: deployment config and owner setup checklist`.
