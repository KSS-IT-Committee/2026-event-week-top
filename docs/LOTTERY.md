# Viewing Lottery (公演観覧抽選)

The `/lottery` pages collect ranked viewing preferences (第1〜第3希望) for
the class plays of the 開拓部門 (grades 3–4) and 創作部門 (grades 5–6). The
two lotteries ask different questions: for **創作部門** an applicant ranks up
to three _classes_ per performance slot; for **開拓部門** a parent ranks up
to three _performances (time slots)_ in one single question — which time
they want to attend. This document explains the moving parts and, most
importantly, **how to add another lottery later**.

## How it works

- **Definitions are code, not rows.** Every lottery (its slots, acts,
  eligibility, application window) is an entry in `LOTTERIES` in
  `lib/lotteries.ts`. The database only stores the opaque ids defined there.
- **`slots` are the questions; `acts` are what gets ranked.** 創作部門 has 4
  slots (one per performance) whose acts are the grade 5–6 classes. 開拓部門
  has a single slot (`preferred-slot`, 「観覧を希望する公演」) whose acts are
  the 8 timed performances themselves. Any future lottery picks whichever
  shape fits — the storage and validation are identical.
- **One table stores every lottery's entries.** `lottery_entries`
  (`db/schema.ts`, canonical copy in `2026-db`) holds one row per
  `(lottery_id, slot_id, username, applicant_type)` with `first_choice` /
  `second_choice` / `third_choice`. Resubmitting replaces the account's rows
  for that lottery + applicant type wholesale (delete + insert in one
  transaction), so a blank submission withdraws the application.
- **Accounts and eligibility.** Parents have no accounts of their own, so
  they apply through their child's account. Eligibility requires an exact
  base student username (`/^[1-6][A-D]\d{2}$/` — alias accounts like
  `4D11_sakuten` are excluded, so one student never yields two entry sets)
  whose class is in the lottery's `eligibleClasses` — "parents with a child
  in 開拓部門" is exactly "accounts of grade 3–4 classes". Staff accounts
  (exactly `/^k\d{7}$/`) have no class; they are eligible only on lotteries
  with `canStaffApply` (currently 創作部門 only), always as themselves via
  the `student` applicant type (labeled 本人), never as `parent`. On
  lotteries offering both `student` and `parent` types, one account may hold
  one entry set per type. **Note for the draw:** the parent entry is per
  _child account_, not per household — a family with several children can
  hold one parent entry per child; decide at draw time whether and how to
  dedupe.
- **The pages.** `/lottery` lists the lotteries with per-account eligibility;
  `/lottery/[lotteryId]` hosts the form (`?as=student|parent` switches the
  applicant type where both are offered). Both are wrapped in `AuthGuard`.
  The server action (`app/lottery/[lotteryId]/actions.ts`) re-validates
  everything — session, eligibility, window, choice integrity — because
  server actions are directly invocable, and rate-limits per username.

## Adding a new lottery

1. Append a definition to `LOTTERIES` in `lib/lotteries.ts` — id, title,
   description, notes, `applicantTypes`, `eligibleClasses`, `canStaffApply`,
   `acts`, `slots`, window. **No schema change and no migration is needed.**
2. Pick ids that will stay stable (`lottery_id`, slot ids, act ids are what
   gets stored; renaming them orphans saved entries).
3. Extend `lib/lotteries.test.ts` with the new definition's pins (slot/act
   lists, eligibility cases) and run `npm run test`.
4. If the acts are not class plays, act ids can be any short string — the
   `acts` list is the validation allow-list, and labels are free text.

Opening/closing applications is also just config: set `opensAt` / `closesAt`
(`null` = no bound) and deploy. Always construct the dates with an explicit
offset — `new Date("2026-09-05T17:00:00+09:00")` — the production server does
not run in JST, so an offset-less literal silently shifts the deadline by the
server's timezone.

## Reading the collected entries

There is no admin UI yet; query `appdata` directly, e.g. tallies for the
draw:

```sql
SELECT slot_id, first_choice, count(*)
FROM lottery_entries
WHERE lottery_id = 'kaitaku-performance'
GROUP BY slot_id, first_choice
ORDER BY slot_id, first_choice;
```

## PR previews

VPS previews run against a schema-only clone of `appdata` (empty `users`)
while the login cookie is vouched for by the production auth host, so a
save would normally fail the `lottery_entries.username → users.username`
foreign key. `db/ensurePreviewUser.ts` handles this: on `IS_PR_PREVIEW`
(and only there) the save transaction first upserts a stub `users` row for
the session's username — the stub's password hash is a discarded random
secret, so it can never be logged in with. Production and local runs skip
this entirely; the FK stays fully enforced there.

## Not included (yet)

- **The draw itself.** Winner selection needs per-venue capacities, which are
  not decided; the schema anticipates a future `lottery_results` table
  (additive) once they are.
- **Results announcement / per-user result pages.**

## Deploy order

The `lottery_entries` table ships as a `2026-db` migration. Merge and migrate
`2026-db` **first**, then deploy this app (the poll loop redeploys on merge) —
until the migrator has run, `/lottery` pages will error on the missing table.
