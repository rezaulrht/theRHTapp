# Habits

Part of the [personal apps design](2026-11-13-overview-design.md). Lines marked
**(call)** are the designer's decisions.

The owner's problems, in their words: sleeping through the 5:30 alarm and so
missing Fajr and the gym; breakfast due by 8:30 dragging to 8:50; forgetting
the mid-morning snack; sleeping later than 11:30. They want to be told when to
do what, and to see at the end of the day where points were lost.

## Routine items

The owner builds the routine from items. Each item has:

- a name
- points, set by the owner
- which days it applies to: specific days of the week, or a day type from the
  week pattern in settings (Workday, Class day), so different days have
  different routines
- a timing, one of three kinds:

| Timing | Example | Meaning |
|---|---|---|
| Fixed window | Breakfast by 8:30; lunch 1:30 to 2:00 | An optional start time and a due time |
| Prayer | Fajr, Zuhr, Asr, Maghrib, Isha | Window runs from that prayer's start to the next prayer's start (Fajr ends at sunrise) |
| Repeating | Drink water every 90 minutes, 9:00 to 21:00 | Nudges through the day with a daily count target |

A fixed-window item with no due time (brush teeth, say) is on time whenever it
is done before the day ends **(call)**.

Items can be added, edited, reordered, paused and removed at any time.

Starting routine, as seed data the owner will edit: wake 5:30, Fajr, gym,
breakfast by 8:30, snack 11:00 to 11:30, Zuhr 1:00 to 1:30, lunch 1:30 to
2:00, walk after lunch, Asr, Maghrib, dinner by 8:00 p.m., Isha, study or
office work, brush teeth, sleep by 11:30 p.m., water (repeating).

## Prayer times

- Calculated each day for the location in settings, on the back end, using a
  standard calculation library (for example `adhan`). No outside service is
  called **(call)**. The location starts as Dhaka **(call)**; the owner did not
  name their city.
- Calculation method and the Asr rule are settings. Starting values: University
  of Islamic Sciences, Karachi method and Hanafi Asr, which are the usual
  choices in Bangladesh **(call)**. The owner should confirm these match their
  local mosque.
- A prayer item's window can be narrowed by the owner, for example Zuhr between
  1:00 and 1:30, in which case that narrower window is used.

## Marking done

- One tap marks an item done. The time of the tap decides on time or late.
- The recorded time can be corrected afterwards, for when the item was done on
  time but ticked later.
- A done mark can be undone.
- Repeating items are tapped once per occurrence (one tap per glass of water).

## Scoring

| Result | Rule | Points for a 5-point item |
|---|---|---|
| On time | Done within the window | +5 |
| Late | Done after the due time but before the day ends | +2.5 |
| Missed | Not marked done by the end of the day | −7.5 |

- The late share (half) and the miss multiplier (1.5) are settings, with a
  global value and an optional override per item.
- Repeating items **(call)**: reaching the daily target earns full points,
  reaching at least half of it earns the late share, and less than half is a
  miss.
- The habit day ends at 4:00 a.m., not midnight **(call)**, so going to bed at
  1:00 a.m. is recorded as a late "sleep" on the right day. The hour is a
  setting. Fajr and the 5:30 wake-up fall after it and belong to the new day.
- Each day keeps the points and rules it was scored with. Changing an item's
  points later does not rewrite past days **(call)**.

## Skip days

A day can be marked as skipped (sick, travel) with an optional reason. A
skipped day scores nothing, sends no habit reminders, and does not break
streaks. A single item can also be skipped for one day.

## Reminders

Per item, the owner chooses the channel (notification, email, both, none) and
which of these fire:

- when the window opens
- at the due time
- a warning before the window closes; the lead time is a setting, starting at
  10 minutes **(call)**

Repeating items notify at each interval. Email is off by default for repeating
items so the inbox is not flooded **(call)**. Reminders stop for an item once
it is marked done for that occurrence.

An optional end-of-day summary can be sent with the score and what was lost.

## What the owner sees

- Today: the routine in time order, each item's state, the running score
  against the daily target, and what is due next.
- End of day: total score, the day marked won or lost against the daily target
  (a setting), and the items that cost points, largest loss first.
- Streaks: consecutive days each item was done (on time or late), with the
  current and best streak. A missed day resets it; a skipped day does not.
- Weekly and monthly charts of the daily score, and a ranking of the weakest
  items by points lost and by miss rate.
- Any past day can be opened and corrected.

## Settings for this section

Routine items, late share, miss multiplier, day-end hour, daily target, warning
lead time, prayer calculation method and Asr rule, end-of-day summary.

## Tests

Scoring for on time, late and missed; per-item overrides; repeating-item
scoring; the 4:00 a.m. day boundary; prayer windows; streaks across skipped
days; past days unchanged after an item is edited.
