# Viewing Lottery (公演観覧抽選)

The `/lottery` pages collect ranked viewing preferences (第1〜第3希望) for
the class plays of the 開拓部門 (grades 3–4) and 創作部門 (grades 5–6),
across the festival's two days (9/12・9/13 — the program repeats each day).
The two lotteries ask different questions: for **創作部門** an applicant
ranks up to three _classes_ per performance slot (4 performances × 2 days);
for **開拓部門** a parent ranks up to three _performances (time slots)_ once
per day — which time they want to attend. Each entry also carries a 観覧人数
(1–2 for parents, always 1 for 本人 entries). This document explains the
moving parts and, most importantly, **how to add another lottery later**.

## How it works

- **Definitions are code, not rows.** Every lottery (its slots, acts,
  eligibility, application window) is an entry in `LOTTERIES` in
  `lib/lotteries.ts`. The database only stores the opaque ids defined there.
- **`slots` are the questions; `acts` are what gets ranked.** 創作部門 has 8
  slots (4 performances × 2 days, ids `sep12-slot-1`…`sep13-slot-4`) whose
  acts are the grade 5–6 classes. 開拓部門 has one slot per festival day
  (`sep12` / `sep13`) whose acts are the 8 timed performances themselves —
  so a family may enter each day separately. Any future lottery picks
  whichever shape fits — the storage and validation are identical.
- **観覧人数 (`party_size`).** Every entry row stores how many people it
  admits if drawn. The per-applicant-type maximum is app policy
  (`MAX_PARTY_SIZE_BY_APPLICANT_TYPE`: parents 2, 本人 1 — no selector is
  shown for 本人); the DB only checks positivity, so raising the maximum
  later is config-only.
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
   Optional `parentNotes` renders as red bullets on the 保護者 tab only —
   notices a parent must not miss (kaitaku: who may apply; sousaku: the
   child's-class priority and its scope).
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

Preview clones are schema-only (`pr-db.sh`), so `users` is empty there —
which is why `lottery_results` carries no FK to it, and why loading the draw's
SQL works on a preview as-is. `lottery_entries` is the one that needs help:

VPS previews run against a schema-only clone of `appdata` (empty `users`)
while the login cookie is vouched for by the production auth host, so a
save would normally fail the `lottery_entries.username → users.username`
foreign key. `db/ensurePreviewUser.ts` handles this: on `IS_PR_PREVIEW`
(and only there) the save transaction first upserts a stub `users` row for
the session's username — the stub's password hash is a discarded random
secret, so it can never be logged in with. Production and local runs skip
this entirely; the FK stays fully enforced there.

## The result side

- **The draw runs outside this app.** `2026-lottery` reads the exported
  entries, draws the winners, and emits the `lottery_results` INSERTs
  (`./scripts/generate-sql.sh`). No seat is ever created by this app; it only
  reads them, and — once a holder asks — moves one to another account or
  deletes it (see 譲渡 and 破棄 below).
- **`lottery_results`** (`db/schema.ts`, canonical copy in `2026-db`) holds one
  row per seat awarded to a school account: `(lottery_id, slot_id, username,
applicant_type)` is unique — nobody can be in two rooms at once — plus the
  `act_id` won, the `party_size` admitted, the `choice_rank` that won, and
  `is_priority` for a 保護者 seat granted by the child's-class guarantee.
  **A missing row is a loss, not an error**: `/lottery/results` joins against
  `lottery_entries` to tell "applied and lost" from "never applied".
- **`username` is not a foreign key here** (unlike `lottery_entries`). No app
  writes this table, the loader copies usernames straight off already-checked
  entry rows, and the schema-only PR preview clones have an empty `users`
  table — a key would break every preview to re-check something the loader
  already guarantees. The generated SQL ends with a `DO $$` block that reports
  any username missing from `users` as a NOTICE, which is what the constraint
  was actually for. Trade-off: deleting a `users` row leaves its results
  behind, and they are unreadable rather than harmful.
- **External applicants are deliberately absent.** They hear their result from
  the form provider. Covering them later is an additive table, not a change to
  this one.
- **Publishing is a config switch, not a deploy of data.** Each lottery's
  `resultsAnnouncedAt` (`lib/lotteries.ts`) gates the page; it is `null` by
  default, which hides every result **however many rows are already loaded**.
  So the SQL can be applied early and safely, and announcing is a one-line
  edit. Construct the date with an explicit `+09:00` offset, as with
  `opensAt` / `closesAt`.

## Handing a seat on: 譲渡 and 破棄

Once results are announced, `/lottery/results` turns each won seat into a link
to `/lottery/results/[ticketId]` (the `lottery_results` row id), where its
holder can give it to another school account or throw it away. This is the one
place an app writes `lottery_results` — the draw still creates every row.

- **The seat is one row for its whole life.** Claiming a transfer REWRITES
  `lottery_results.username`; nothing is copied or re-inserted. Every existing
  reader (the results page, a reception-desk tally, the draw's own unique key)
  therefore keeps working without knowing transfers exist. `is_priority` is
  cleared on the way: it recorded that the ORIGINAL holder got the seat through
  the child's-class guarantee, which says nothing about the new one.
- **`lottery_ticket_transfers` is the offer, not the ownership.** One row per
  offer — `result_id`, `from_username`, `to_username`, and a status of
  `pending` / `claimed` / `cancelled` / `declined`. A partial unique index on
  `result_id where status = 'pending'` allows exactly one outstanding offer per
  seat, so re-offering means cancelling first; resolved rows are kept as the
  provenance of a seat that changed hands. Discarding a ticket deletes the row
  and cascades its offers away, which is what 「元に戻せません」 promises.
- **Only 本人 seats change hands** (`TRANSFERABLE_APPLICANT_TYPES`). A 保護者
  seat admits somebody's parents, and passing those between families is not
  something the committee wants to invite — so 譲渡 is refused for every
  保護者 ticket, which makes the **whole 開拓部門 lottery** non-transferable,
  since it only ever issues 保護者 seats. 破棄 is deliberately NOT bounded by
  this: releasing a seat you cannot use is the point, and it is the only way
  out of a 保護者 ticket. The rule is enforced on both ends (the sender's
  actions and the recipient's claim), so an offer made before the rule existed
  still cannot be claimed — only cancelled or declined.
- **Three steps to send, because usernames are typed by hand.** 譲渡できるか
  確認する only answers "is this a school account other than yours?" — it reads
  `users` and never `lottery_results`, so the box cannot be used to look up
  somebody else's seats; it is rate-limited per account for the same reason.
  The confirmation is pinned to the exact username that was checked, so editing
  the box afterwards disarms 譲渡する.
- **Whether the recipient can take it is decided on their screen**, where the
  answer is about their own tickets: 受け取る is blocked when they already hold
  a seat for that performance **in the same 区分**. Same 区分 only, because a
  本人 seat and a 保護者 seat for one performance are two different people (the
  student and their parents) — a combination one account may already hold. That
  rule is also the DB's `lottery_results_slot_applicant_unique` key, so a lost
  race fails identically.
- **Two people wanting each other's seat is an EXCHANGE, not a deadlock.** That
  conflict rule would otherwise trap a swap: your own seat is exactly what
  stops you taking theirs, and theirs stops them taking yours, so neither can
  go first. When the seat blocking a claim is itself already offered to the
  account making that offer, both people have pressed 譲渡する, so
  `claimTicketTransfer` completes BOTH transfers and moves BOTH rows in one
  transaction — the inbox shows 交換する and names both seats. Nobody is short
  a ticket in between, which is what makes an exchange safe where a general
  "release my seat and hope someone takes it" would not be. It fixes the
  two-person cycle only; a three-way ring still deadlocks, and 破棄 (or a third
  person) remains the way out of that.
  - The crossover needs the unique key **deferred to COMMIT**: each row passes
    through the other's key on the way, and Postgres checks a non-deferrable
    UNIQUE per row as the UPDATE runs — two statements or one `UPDATE … CASE`
    both raise `duplicate key`. `2026-db` migration **0018** recreates the
    constraint as `DEFERRABLE INITIALLY IMMEDIATE`, so it still fires per
    statement for everyone else and only the exchange transaction runs
    `SET CONSTRAINTS … DEFERRED`. drizzle-kit cannot express deferrability, so
    that migration is hand-written and `db/schema.ts` carries a comment saying
    so — `generate` sees no drift, but `push` would.
  - Both people pressing 交換する in the same instant take the two transfer
    rows in opposite orders, so Postgres may abort one with a deadlock error.
    That is detected, never a hang: the loser rolls back untouched and gets the
    retry message, by which time the winner has completed the exchange for
    both.
- **The deadline is per ticket, not per lottery**
  (`describeTicketTransferBlock`, the second of its two rules): a seat stops
  being transferable `TICKET_TRANSFER_CLOSES_BEFORE_START_MS` (10 min)
  before its own performance starts — five minutes ahead of the 受付 deadline
  (「公演開始5分前まで」), so a seat handed over at the last moment still leaves
  its new holder time to reach the desk. That needs a machine-readable start
  time, which is why slots carry `startsAt` (創作: the slot IS the performance)
  or `date` alongside an act's `startTime` (開拓: the slot is a day, the ACT is
  the performance). A definition with neither imposes no deadline, exactly as a
  null `opensAt`/`closesAt` imposes no bound. Cancelling, declining and 破棄
  stay available afterwards — they only ever give a seat up. Both rules return
  the sentence to show rather than a bare boolean, so the sender's page and the
  recipient's inbox can never explain the same refusal differently.
- **Re-running the draw would clobber transfers.** `lottery_results` rows are
  keyed by (lottery, slot, username, 区分), so a reload of the draw's SQL puts
  seats back with their original owners and leaves the claimed transfer rows
  pointing at seats their recipients no longer hold. Once transfers are live,
  treat the loaded draw as final.

## Not included (yet)

- **Per-class attendee lists** (who to expect at each room's reception desk).
  The data is in `lottery_results`; only the page is missing.
- **Results for external applicants.**
- **Any notice that a ticket was offered to you.** The inbox sits at the top of
  `/lottery/results`, so the recipient has to look. A push of some kind (mail,
  the top page) is the obvious next step.

## Deploy order

The `lottery_entries` and `lottery_ticket_transfers` tables ship as `2026-db`
migrations. Merge and migrate `2026-db` **first**, then deploy this app (the
poll loop redeploys on merge) — until the migrator has run, `/lottery` pages
will error on the missing table. `lottery_ticket_transfers` is migration
`0017`, and it is purely additive (a new enum, a new table), so migrating ahead
of the app deploy is safe: the table simply sits empty until the app that
writes it ships.
