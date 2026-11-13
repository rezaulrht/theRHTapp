# Foundation

Part of the [personal apps design](2026-11-13-overview-design.md). Lines marked
**(call)** are the designer's decisions.

Foundation is everything the three sections share. It is done when the owner
can open the deployed app on their iPhone, add it to the home screen, log in,
change a setting, and receive a test reminder by notification and by email.

## Login

- One account. There is no sign-up page.
- The account is created once from the command line with a setup script that
  asks for an email and password **(call)**.
- Passwords are stored hashed (argon2). The session is an httpOnly cookie that
  lasts 30 days and renews on use **(call)**, so the phone stays logged in.
- Password can be changed in settings. Five wrong attempts lock login for 15
  minutes **(call)**.
- The browser only ever talks to the Vercel domain. Next.js forwards `/api/*`
  to the Heroku back end **(call)**. Reason: iPhone Safari blocks cookies sent
  between two different domains, which would break login.

## Installable web app

- Web manifest, icons and a service worker so the app installs to the home
  screen and opens full-screen.
- On an iPhone that has not installed it, show a short guide: Share, then "Add
  to Home Screen". Notifications are requested only after install, from a
  button the owner taps, because iOS requires that.
- No offline data entry in the first version **(call)**. With no connection the
  app shows its shell and a plain "No connection" message.

## Design system

The owner chose direction A, "bottle green and brass", from three mockups. The
mockup file is kept at
`.superpowers/brainstorm/394-1794586654/content/visual-style.html`.

Starting tokens, taken from that mockup:

| Token | Value | Use |
|---|---|---|
| Ground | `#0E2620` | Page background |
| Panel | `#143229` | Raised surfaces |
| Ivory | `#F1EBDD` | Main text |
| Sage | `#9FB3A8` | Secondary text |
| Brass | `#C8A662` | Accent, active states, dividers at low opacity |

- Numbers and display text: Bodoni Moda. Everything else: Hanken Grotesk.
- Amounts use tabular figures so columns line up.
- Dark theme only **(call)**; the chosen direction is a dark one.
- An alert colour for over-budget and lost points must be added and must read
  clearly on the green ground. Builder's choice.

Motion, at the level the owner asked for (Awwwards-style):

- Smooth scrolling (Lenis) on long pages, page transitions between sections,
  numbers that count to their value, and charts that draw in.
- Motion never delays a task. Adding an expense and ticking a habit respond
  instantly; flourish happens after the action, not before it.
- Respect the device's "reduce motion" setting.

Layout is designed for the phone first, then widened for PC and laptop. Bottom
navigation on phone, side navigation on wide screens: Today, Money, Habits,
Vault, Settings.

## Today page **(call)**

The front page after login. It shows today's spending and a button to add an
expense, today's habit score with the next routine item due, and upcoming
reminders and pinned Vault items. Each block appears once its section is built.

## Central settings

One settings area with a part for each section plus general settings. Rule for
the whole project: if a value could reasonably differ next year, it is a
setting stored in the database with a starting value from seed data, not a
constant in code.

General settings:

- Time zone (starts as Asia/Dhaka) and location for prayer times
- Currency symbol and name (starts as ৳, BDT)
- Week pattern: which days are which day type. Starts as Saturday to Thursday
  "Workday" and Friday "Class day". Day types can be added and renamed. Money
  and Habits both use this.
- Notification email address
- Quiet hours during which nothing is sent except items marked to ignore quiet
  hours (a 5:30 a.m. alarm must still fire) **(call)**
- Export all data as a download (JSON, plus CSV for money) **(call)**

## Reminder engine

One engine serves all three sections.

- A reminder has: what it belongs to, when it fires (once, or repeating by day
  of week, by interval, or relative to another time such as "10 minutes before
  a window closes"), which channels it uses (notification, email, both, or
  none), and its text.
- The back end checks once a minute for reminders that are due and sends them
  **(call)**. Each send is recorded with its result so a missed reminder can be
  investigated.
- A reminder is never sent twice for the same occurrence, including after a
  restart.
- If the back end was down, reminders that came due in the last 30 minutes are
  sent on startup; older ones are recorded as missed and not sent **(call)**.
- Tapping a notification opens the related item in the app.
- Settings has a "Send test reminder" button.
- Phone notifications use web push. Email uses Resend.

## Quality bar

- Automated tests cover the reminder schedule calculations and login.
- Money amounts, scores and schedules are calculated on the back end; the
  front end displays them.
- All times are stored in UTC and shown in the settings time zone.

## Accounts the owner must create

Heroku (Basic dyno), Vercel, Neon, Cloudflare R2 (needed at the Vault stage),
Resend. The builder provides a checklist with the exact environment variable
names and an `.env.example` file.
