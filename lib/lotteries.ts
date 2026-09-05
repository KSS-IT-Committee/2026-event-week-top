import {
  type ClassName,
  CLASSNAMES,
  isClassName,
  type LotteryApplicantType,
} from "@/db/schema";

/**
 * Viewing-lottery definitions and the pure rules around them.
 *
 * Each lottery collects, per performance slot, an applicant's ranked act
 * preferences (up to MAX_CHOICES_PER_SLOT). Definitions are code, not DB
 * rows: `lottery_entries` (db/schema.ts) only stores the opaque ids defined
 * here, so adding a future lottery = append a definition to LOTTERIES —
 * no schema change, no migration. Keep every id stable once entries exist;
 * saved rows reference them.
 *
 * No server-only import: types are safe to import from client components.
 * Pages pass the data itself down as props — a client-side VALUE import
 * would drag db/schema (→ drizzle-orm) into the browser bundle. Anything
 * session- or DB-touching stays in the server action / db helpers.
 */

export const MAX_CHOICES_PER_SLOT = 3;

export type LotterySlot = {
  id: string;
  label: string;
  // Time range shown next to the label (e.g. 「8:45～9:15」). Omit when the
  // slot is a question rather than one timed performance (see kaitaku).
  time?: string;
  // When this slot's performance begins — set on slots that ARE one timed
  // performance (創作部門). Slots that stand for a whole festival day
  // (開拓部門) leave it undefined and set `date` instead, because there it is
  // the ACT that picks the time. Read through getTicketStartsAt(), which is
  // what decides a won seat's transfer deadline. Construct with an explicit
  // +09:00 offset, like opensAt/closesAt.
  startsAt?: Date;
  // 「2026-09-12」 — the festival day a day-slot covers, combined with the
  // act's `startTime` by getTicketStartsAt(). Omit on timed slots.
  date?: string;
};

export type LotteryAct = {
  id: string;
  label: string;
  // 「08:45」 JST — when this act begins, for lotteries whose acts are the
  // timed performances (開拓部門). Meaningless (and omitted) where the acts
  // are class plays, because there every act in a slot starts together.
  startTime?: string;
};

export type Lottery = {
  id: string;
  title: string;
  description: string;
  // Shown as bullet points on the application page (venue rules, breaks…).
  notes: readonly string[];
  // Extra bullet points shown in red on the 保護者 tab only — notices a
  // parent must not miss (who may apply, how a child's own class is
  // prioritized).
  parentNotes?: readonly string[];
  // Which kinds of applicant may enter, in display order. Parents apply via
  // their child's student account, so "parent" still authenticates as the
  // child; one account holds at most one entry set per type.
  applicantTypes: readonly LotteryApplicantType[];
  // The account's class (classFromRoles(user.roles)) must be one of these.
  // For parents this is the child's class — "parents with a child in the
  // division" is exactly "accounts of that division's classes".
  eligibleClasses: readonly ClassName[];
  // Whether staff (Teachers-role) accounts may enter. Staff have no class,
  // so eligibleClasses never admits them; they apply as themselves via the
  // "student" applicant type (labeled 本人), never as "parent".
  canStaffApply: boolean;
  // What an applicant ranks (up to MAX_CHOICES_PER_SLOT) within each slot.
  // For sousaku these are the class plays; for kaitaku they are the timed
  // performances themselves. The ids are opaque to the DB either way.
  acts: readonly LotteryAct[];
  // The independent questions asked — one entry row per slot an applicant
  // fills. Sousaku asks per performance; kaitaku asks a single question
  // (which performance to attend), so it has exactly one slot.
  slots: readonly LotterySlot[];
  // Application window. null = no bound on that side. Always construct with
  // an explicit offset — new Date("2026-09-05T17:00:00+09:00") — because the
  // production server does not run in JST; an offset-less literal would
  // shift the deadline by the server's timezone.
  opensAt: Date | null;
  closesAt: Date | null;
  // When the drawn result becomes visible on /lottery/results. null (the
  // default until the committee announces a time) hides every result, even
  // after the draw has been loaded into `lottery_results` — so loading the
  // rows early can never leak them. Construct with an explicit offset for the
  // same reason opensAt/closesAt do: the server does not run in JST.
  resultsAnnouncedAt: Date | null;
};

// Population roles → class code parts. Must stay in lockstep with the
// G1–G6 / ClassA–ClassD members of ROLENAMES (db/schema.ts), which
// 2026-account-generator derives from the roster. Plain string keys (not
// the Role type): roles come off SessionUser.roles, which is string[] so
// preview sessions stay forward-compatible with roles this build predates.
const GRADE_BY_ROLE: Record<string, string> = {
  G1: "1",
  G2: "2",
  G3: "3",
  G4: "4",
  G5: "5",
  G6: "6",
};
const CLASS_LETTER_BY_ROLE: Record<string, string> = {
  ClassA: "A",
  ClassB: "B",
  ClassC: "C",
  ClassD: "D",
};

/**
 * The class code an account's roles pin it to ("G4" + "ClassD" -> "4D"), or
 * null when the roles don't name exactly one class — no grade/class roles
 * (staff, committee-only accounts) or contradictory ones (two grades). Both
 * roles come from 2026-account-generator's users.sql, so roster accounts —
 * and hand-made aliases granted the same roles — resolve cleanly.
 */
export function classFromRoles(roles: readonly string[]): ClassName | null {
  const grades = roles.filter((role) => role in GRADE_BY_ROLE);
  const letters = roles.filter((role) => role in CLASS_LETTER_BY_ROLE);
  if (grades.length !== 1 || letters.length !== 1) return null;
  const classCode = GRADE_BY_ROLE[grades[0]] + CLASS_LETTER_BY_ROLE[letters[0]];
  return isClassName(classCode) ? classCode : null;
}

function classesInGrades(grades: readonly string[]): ClassName[] {
  return CLASSNAMES.filter((className) => grades.includes(className[0]));
}

// 「3A」→「3年A組」 — the acts are the division's class plays.
function actForClass(className: ClassName): LotteryAct {
  return { id: className, label: `${className[0]}年${className[1]}組` };
}

const KAITAKU_CLASSES = classesInGrades(["3", "4"]);
const SOUSAKU_CLASSES = classesInGrades(["5", "6"]);

// 創作展 runs two days; both divisions repeat the same program each day.
const FESTIVAL_DAYS = [
  { id: "sep12", label: "9月12日（土）", date: "2026-09-12" },
  { id: "sep13", label: "9月13日（日）", date: "2026-09-13" },
] as const;

// 開拓部門: a parent ranks WHICH performance (time slot) to attend on a
// given day, not which class — so the ranked choices are the performances
// themselves, asked once per festival day (one slot per day).
const KAITAKU_PERFORMANCES: LotteryAct[] = [
  { id: "performance-1", label: "第一公演（8:45～9:15）", startTime: "08:45" },
  { id: "performance-2", label: "第二公演（9:30～10:00）", startTime: "09:30" },
  {
    id: "performance-3",
    label: "第三公演（10:15～10:45）",
    startTime: "10:15",
  },
  {
    id: "performance-4",
    label: "第四公演（11:00～11:30）",
    startTime: "11:00",
  },
  {
    id: "performance-5",
    label: "第五公演（12:30～13:00）",
    startTime: "12:30",
  },
  {
    id: "performance-6",
    label: "第六公演（13:15～13:45）",
    startTime: "13:15",
  },
  {
    id: "performance-7",
    label: "第七公演（14:00～14:30）",
    startTime: "14:00",
  },
  {
    id: "performance-8",
    label: "第八公演（14:45～15:15）",
    startTime: "14:45",
  },
];

const SOUSAKU_PERFORMANCE_TIMES = [
  { label: "第一公演", time: "8:45～10:00", startTime: "08:45" },
  { label: "第二公演", time: "10:20～11:35", startTime: "10:20" },
  { label: "第三公演", time: "12:30～13:45", startTime: "12:30" },
  { label: "第四公演", time: "14:05～15:20", startTime: "14:05" },
] as const;

export const LOTTERIES: readonly Lottery[] = [
  {
    id: "kaitaku-performance",
    title: "開拓部門公演 観覧抽選",
    description:
      "開拓部門（3・4年生）のクラス劇の観覧抽選です。開拓部門の生徒の保護者の方が対象で、9月12日（土）・13日（日）のそれぞれについて、観覧を希望する公演（時間帯）を第1〜第3希望まで選べます。",
    notes: [
      "公演時間は30分、幕間は15分です。",
      "お昼休憩は60分です。第四公演終了後、12:15まで観客入場禁止となります。",
      "保護者の方はお子様のアカウントでログインして申し込んでください。保護者の方の希望はお子様のアカウント1つにつき1件です。",
      "観覧人数は1日につき2名まで選べます。",
    ],
    parentNotes: [
      "この抽選に申し込めるのは、お子様が開拓部門（3・4年生）に在籍している保護者の方のみです。",
    ],
    applicantTypes: ["parent"],
    eligibleClasses: KAITAKU_CLASSES,
    canStaffApply: false,
    acts: KAITAKU_PERFORMANCES,
    // A day-slot, not a timed one: the ACT (which performance) carries the
    // time, so the day's date is what getTicketStartsAt() combines it with.
    slots: FESTIVAL_DAYS.map((day) => ({
      id: day.id,
      label: `${day.label}の公演`,
      date: day.date,
    })),
    opensAt: new Date("2026-07-17T00:00:00+09:00"),
    // Exclusive bound: the whole of Aug 25 JST is accepted (8月25日まで).
    closesAt: new Date("2026-08-26T00:00:00+09:00"),
    resultsAnnouncedAt: new Date("2026-08-27T12:30:00+09:00"),
  },
  {
    id: "sousaku-performance",
    title: "創作部門公演 観覧抽選",
    description:
      "創作部門（5・6年生）のクラス劇の観覧抽選です。全学年の生徒・保護者の方と教職員の方が対象で、9月12日（土）・13日（日）の公演ごとに観たいクラスを第1〜第3希望まで選べます。",
    notes: [
      "公演時間は75分、幕間は20分です。",
      "お昼休憩は55分です。第二公演終了後、12:15まで観客入場禁止となります。",
      "生徒本人と保護者の方は、同じアカウントからそれぞれ別に申し込めます。保護者の方の希望はお子様のアカウント1つにつき1件です。",
      "教職員の方はご自身のアカウントでログインして申し込んでください。",
      "保護者の方の観覧人数は1公演につき2名まで選べます（生徒本人・教職員の方は1名です）。",
    ],
    parentNotes: [
      "お子様のクラスを第1希望に選んだ公演は、その公演の申込人数が座席数を超えない限り、そのまま観覧できます。お子様の公演を観覧するには、いずれか1公演で第1希望に選ぶだけで大丈夫です。",
      "お子様のクラスを2公演以上で希望した場合、優先して観覧できるのはいずれか1公演のみです。それ以外の希望は、他の申込者の方と同じ条件で抽選されます。",
      "これらの優先は、お子様が創作部門（5・6年生）に在籍している保護者の方にのみ適用されます。",
    ],
    applicantTypes: ["student", "parent"],
    eligibleClasses: [...CLASSNAMES],
    canStaffApply: true,
    acts: SOUSAKU_CLASSES.map(actForClass),
    slots: FESTIVAL_DAYS.flatMap((day) =>
      SOUSAKU_PERFORMANCE_TIMES.map((performance, index) => ({
        id: `${day.id}-slot-${index + 1}`,
        label: `${day.label}${performance.label}`,
        time: performance.time,
        startsAt: new Date(`${day.date}T${performance.startTime}:00+09:00`),
      })),
    ),
    opensAt: new Date("2026-07-17T00:00:00+09:00"),
    // Exclusive bound: the whole of Aug 25 JST is accepted (8月25日まで).
    closesAt: new Date("2026-08-26T00:00:00+09:00"),
    resultsAnnouncedAt: new Date("2026-08-27T12:30:00+09:00"),
  },
];

// "student" reads 本人 (not 生徒本人): staff accounts also apply through it
// on lotteries with canStaffApply.
export const APPLICANT_TYPE_LABELS: Record<LotteryApplicantType, string> = {
  student: "本人",
  parent: "保護者",
};

// 観覧人数の上限（1件あたり） — parents may bring up to two people; a 本人
// entry (student or staff) is always the account holder alone, so no
// selector is shown for it. Policy lives here, not in the schema: the DB
// only sanity-checks positivity.
export const MAX_PARTY_SIZE_BY_APPLICANT_TYPE: Record<
  LotteryApplicantType,
  number
> = {
  student: 1,
  parent: 2,
};

/**
 * Whether this lottery's drawn results may be shown yet. Deny-by-default: a
 * lottery with no announcement time keeps its results hidden however many
 * rows sit in `lottery_results`.
 */
export function areLotteryResultsAnnounced(
  lottery: Lottery,
  now: Date,
): boolean {
  if (lottery.resultsAnnouncedAt === null) return false;
  return now.getTime() >= lottery.resultsAnnouncedAt.getTime();
}

// 「2026年9月8日（火）10:00」 — always JST, whatever the server's timezone
// is, so a rendered instant can never disagree with what was announced.
function describeJstDateTime(instant: Date): string {
  const date = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "long",
  }).format(instant);
  const weekday = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(instant);
  const time = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
  return `${date}（${weekday}）${time}`;
}

/**
 * 「2026年9月8日（火）10:00」 — when the results go up, or null when no time
 * is configured.
 */
export function describeResultsAnnouncement(lottery: Lottery): string | null {
  if (lottery.resultsAnnouncedAt === null) return null;
  return describeJstDateTime(lottery.resultsAnnouncedAt);
}

/**
 * Human labels for stored ids. `lottery_results` holds the opaque slot/act
 * ids, so a result row is rendered through these; an id the definition no
 * longer knows falls back to itself rather than rendering blank.
 */
export function getSlotLabel(lottery: Lottery, slotId: string): string {
  return lottery.slots.find((slot) => slot.id === slotId)?.label ?? slotId;
}

export function getSlotTime(lottery: Lottery, slotId: string): string | null {
  return lottery.slots.find((slot) => slot.id === slotId)?.time ?? null;
}

export function getActLabel(lottery: Lottery, actId: string): string {
  return lottery.acts.find((act) => act.id === actId)?.label ?? actId;
}

export function getLottery(lotteryId: string): Lottery | null {
  return LOTTERIES.find((lottery) => lottery.id === lotteryId) ?? null;
}

/* ─────────────────────── 当選チケットの譲渡・破棄 ───────────────────────
 *
 * A won seat (one `lottery_results` row) can be handed to another school
 * account or thrown away by its holder. Both are pure-config decisions about
 * WHEN that is still allowed; who may do it is authorization, and lives in
 * the server actions.
 */

/**
 * When the performance a won seat admits to actually begins, or null when the
 * definition carries no clock for it. Two shapes, both already in LOTTERIES:
 *
 *  - the slot IS one timed performance (創作部門) — it carries `startsAt`;
 *  - the slot is a whole festival day and the ACT is the timed performance
 *    (開拓部門) — the day's `date` and the act's `startTime` combine here.
 *
 * Returns null for ids the current definitions no longer know (a renamed
 * slot leaves old rows behind) and for a future lottery that simply has no
 * times — callers treat that as "no deadline", the same way a null
 * opensAt/closesAt means "no bound".
 */
export function getTicketStartsAt(
  lottery: Lottery,
  slotId: string,
  actId: string,
): Date | null {
  const slot = lottery.slots.find((candidate) => candidate.id === slotId);
  if (slot === undefined) return null;
  if (slot.startsAt !== undefined) return slot.startsAt;
  const act = lottery.acts.find((candidate) => candidate.id === actId);
  if (slot.date === undefined || act?.startTime === undefined) return null;
  return new Date(`${slot.date}T${act.startTime}:00+09:00`);
}

// A seat stops being transferable 10 minutes before its performance starts.
// Deliberately EARLIER than the 受付 deadline (5 minutes before, stated in red
// on /lottery/results): a seat handed over at the very last moment would reach
// someone with no time to reach the desk, so the extra 5 minutes is the new
// holder's margin to actually get there. Raising this only ever closes
// transfers sooner, so it is safe to tune. 破棄 is deliberately NOT bounded by
// it: throwing away a ticket you can no longer use harms nobody, and refusing
// to would just leave dead rows around.
export const TICKET_TRANSFER_CLOSES_BEFORE_START_MS = 10 * 60 * 1000;

/**
 * The 区分 whose seats may change hands at all.
 *
 * 保護者 seats are excluded by policy, not by mechanism: a 保護者 ticket
 * admits somebody's parents, and handing those seats around between families
 * is not something the committee wants to invite. That rule alone makes the
 * whole 開拓部門 lottery non-transferable, since it only ever issues 保護者
 * seats. 破棄 stays open for them — a parent who cannot come should still be
 * able to release the seat to the キャンセル待ち列.
 */
export const TRANSFERABLE_APPLICANT_TYPES: readonly LotteryApplicantType[] = [
  "student",
];

// The parts of a won seat that decide whether it may be handed on. Any
// `lottery_results`-shaped object satisfies it (db/getLotteryTickets.ts).
export type TransferableTicket = {
  slotId: string;
  actId: string;
  applicantType: LotteryApplicantType;
};

/**
 * Why this seat cannot change hands, as the sentence to show, or null when it
 * can. One message per reason, worded to fit BOTH ends of a transfer, so the
 * sender's page and the recipient's inbox can never disagree about the rule.
 *
 * The deadline half is per ticket, not per lottery: the festival's
 * performances start at different times, so a 9月12日第一公演 seat closes
 * while a 9月13日第四公演 one is still freely transferable.
 */
export function describeTicketTransferBlock(
  lottery: Lottery,
  ticket: TransferableTicket,
  now: Date,
): string | null {
  if (!TRANSFERABLE_APPLICANT_TYPES.includes(ticket.applicantType)) {
    return `${APPLICANT_TYPE_LABELS[ticket.applicantType]}のチケットは譲渡できません。ご覧になれない場合は、チケットの破棄をご検討ください。`;
  }
  const startsAt = getTicketStartsAt(lottery, ticket.slotId, ticket.actId);
  // No clock in the definition = no deadline, the same way a null
  // opensAt/closesAt means no bound.
  if (startsAt === null) return null;
  if (
    now.getTime() <
    startsAt.getTime() - TICKET_TRANSFER_CLOSES_BEFORE_START_MS
  ) {
    return null;
  }
  return "この公演の譲渡受付は終了しました。公演開始10分前を過ぎたチケットは、譲渡も受け取りもできません。";
}

/** Whether this seat may still change hands. */
export function canTransferTicket(
  lottery: Lottery,
  ticket: TransferableTicket,
  now: Date,
): boolean {
  return describeTicketTransferBlock(lottery, ticket, now) === null;
}

/**
 * 「2026年9月12日（土）08:40」 — the last moment this seat can be handed over,
 * or null when its performance has no configured time (= no deadline).
 */
export function describeTicketTransferDeadline(
  lottery: Lottery,
  slotId: string,
  actId: string,
): string | null {
  const startsAt = getTicketStartsAt(lottery, slotId, actId);
  if (startsAt === null) return null;
  return describeJstDateTime(
    new Date(startsAt.getTime() - TICKET_TRANSFER_CLOSES_BEFORE_START_MS),
  );
}

// 「2026年8月30日（日）まで」 — the last day applications are accepted, or
// null when no deadline is configured. Derived from the exclusive closesAt
// bound and rendered in JST, so the pages can never disagree with the
// enforced window (or with what the parent letter announced).
export function describeApplicationDeadline(lottery: Lottery): string | null {
  if (lottery.closesAt === null) return null;
  const lastIncludedInstant = new Date(lottery.closesAt.getTime() - 1);
  const date = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    dateStyle: "long",
  }).format(lastIncludedInstant);
  const weekday = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(lastIncludedInstant);
  return `${date}（${weekday}）まで`;
}

// 「3・4年生」/「全学年」 — who the lottery is for, from its class list.
export function describeEligibleGrades(lottery: Lottery): string {
  const grades = [
    ...new Set(lottery.eligibleClasses.map((className) => className[0])),
  ].sort();
  if (grades.length === 6) return "全学年";
  return `${grades.join("・")}年生`;
}

/**
 * Whether the account may take part in the lottery at all, decided from the
 * session's roles (never the username shape): either a Teachers account on
 * a lottery that admits staff, or a Students account whose role-derived
 * class (the child's class, for parents) is one of the eligible classes.
 * Committee-only and other role-less accounts never pass. NOTE: an alias
 * account granted the same roles as its base account (e.g. "4D11_sakuten"
 * next to "4D11") is eligible too, and entries are keyed by username — so
 * such aliases can hold a second entry set. Grant alias accounts student
 * roles only where that is acceptable.
 */
export function isEligibleForLottery(
  lottery: Lottery,
  roles: readonly string[],
): boolean {
  if (roles.includes("Teachers")) return lottery.canStaffApply;
  if (!roles.includes("Students")) return false;
  const classCode = classFromRoles(roles);
  if (classCode === null) return false;
  return lottery.eligibleClasses.includes(classCode);
}

export function canApplyToLottery(
  lottery: Lottery,
  roles: readonly string[],
  applicantType: LotteryApplicantType,
): boolean {
  if (!lottery.applicantTypes.includes(applicantType)) return false;
  // Staff apply as themselves only — there is no child behind a staff
  // account for a "parent" entry to belong to.
  if (applicantType === "parent" && roles.includes("Teachers")) return false;
  return isEligibleForLottery(lottery, roles);
}

export type LotteryAvailability = "upcoming" | "open" | "closed";

export function getLotteryAvailability(
  lottery: Lottery,
  now: Date,
): LotteryAvailability {
  if (lottery.opensAt !== null && now.getTime() < lottery.opensAt.getTime()) {
    return "upcoming";
  }
  if (
    lottery.closesAt !== null &&
    now.getTime() >= lottery.closesAt.getTime()
  ) {
    return "closed";
  }
  return "open";
}

// One slot's raw rank inputs as submitted ("" = no choice at that rank).
export type SlotChoicesInput = {
  slotId: string;
  choices: readonly string[];
  // Raw 観覧人数 form value; validated only when the slot has choices.
  partySize: string;
};

// One slot's validated preferences, ready to insert.
export type LotteryEntryInput = {
  slotId: string;
  firstChoice: string;
  secondChoice: string | null;
  thirdChoice: string | null;
  partySize: number;
};

export type ParseLotteryEntriesResult =
  { ok: true; entries: LotteryEntryInput[] } | { ok: false; error: string };

/**
 * Validate raw per-slot rank inputs against a lottery definition and shape
 * them for storage. Gaps compact upward (a 1st + 3rd choice becomes 1st +
 * 2nd), a slot with no choices yields no entry (= not applying for it, its
 * partySize is ignored), and unknown slots/acts, a repeated act within a
 * slot, or an out-of-range 観覧人数 reject the whole submission with a
 * user-facing message. maxPartySize comes from the caller's applicant type
 * (MAX_PARTY_SIZE_BY_APPLICANT_TYPE).
 */
export function parseLotteryEntries(
  lottery: Lottery,
  submissions: readonly SlotChoicesInput[],
  maxPartySize: number,
): ParseLotteryEntriesResult {
  const actIds = new Set(lottery.acts.map((act) => act.id));
  const seenSlotIds = new Set<string>();
  const entries: LotteryEntryInput[] = [];

  for (const submission of submissions) {
    const slot = lottery.slots.find((s) => s.id === submission.slotId);
    if (slot === undefined || seenSlotIds.has(submission.slotId)) {
      return { ok: false, error: "申込内容に不正な公演が含まれています。" };
    }
    seenSlotIds.add(submission.slotId);

    if (submission.choices.length > MAX_CHOICES_PER_SLOT) {
      return {
        ok: false,
        error: `希望は1公演につき${MAX_CHOICES_PER_SLOT}件までです。`,
      };
    }

    const choices = submission.choices.filter((choice) => choice !== "");
    if (choices.length === 0) continue;

    for (const choice of choices) {
      if (!actIds.has(choice)) {
        return {
          ok: false,
          error: `「${slot.label}」の希望に不正な選択肢が含まれています。`,
        };
      }
    }
    if (new Set(choices).size !== choices.length) {
      return {
        ok: false,
        error: `「${slot.label}」で同じ選択肢を複数回選ぶことはできません。`,
      };
    }

    const partySize = Number(submission.partySize);
    if (
      !Number.isInteger(partySize) ||
      partySize < 1 ||
      partySize > maxPartySize
    ) {
      return {
        ok: false,
        error: `「${slot.label}」の観覧人数の指定が正しくありません。`,
      };
    }

    entries.push({
      slotId: slot.id,
      firstChoice: choices[0],
      secondChoice: choices[1] ?? null,
      thirdChoice: choices[2] ?? null,
      partySize,
    });
  }

  return { ok: true, entries };
}
