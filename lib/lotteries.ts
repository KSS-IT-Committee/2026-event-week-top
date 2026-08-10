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
};

export type LotteryAct = {
  id: string;
  label: string;
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
  // Optional caution message displayed prominently to applicants.
  caution?: string;
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
  { id: "sep12", label: "9月12日（土）" },
  { id: "sep13", label: "9月13日（日）" },
] as const;

// 開拓部門: a parent ranks WHICH performance (time slot) to attend on a
// given day, not which class — so the ranked choices are the performances
// themselves, asked once per festival day (one slot per day).
const KAITAKU_PERFORMANCES: LotteryAct[] = [
  { id: "performance-1", label: "第一公演（8:45～9:15）" },
  { id: "performance-2", label: "第二公演（9:30～10:00）" },
  { id: "performance-3", label: "第三公演（10:15～10:45）" },
  { id: "performance-4", label: "第四公演（11:00～11:30）" },
  { id: "performance-5", label: "第五公演（12:30～13:00）" },
  { id: "performance-6", label: "第六公演（13:15～13:45）" },
  { id: "performance-7", label: "第七公演（14:00～14:30）" },
  { id: "performance-8", label: "第八公演（14:45～15:15）" },
];

const SOUSAKU_PERFORMANCE_TIMES = [
  { label: "第一公演", time: "8:45～10:00" },
  { label: "第二公演", time: "10:20～11:35" },
  { label: "第三公演", time: "12:30～13:45" },
  { label: "第四公演", time: "14:05～15:20" },
] as const;

export const LOTTERIES: readonly Lottery[] = [
  {
    id: "kaitaku-performance",
    title: "開拓部門公演 観覧抽選",
    caution:
      "※この抽選に申し込めるのは、お子様が開拓部門（3・4年生）に在籍している保護者の方のみです。申し込めるのは、お子様の所属するクラスの公演のみです。",
    description:
      "開拓部門（3・4年生）の生徒の保護者のみが申し込める、お子様の所属するクラス劇の観覧時間の抽選です。開拓部門（3・4年生）の生徒の保護者が対象で、9月12日（土）・13日（日）のそれぞれについて、お子様の所属するクラスの観覧希望公演（時間帯）を第1〜第3希望まで選べます。",
    notes: [
      "公演時間は30分、幕間は15分です。",
      "お昼休憩は60分です。第四公演終了後、12:15まで観客入場禁止となります。",
      "保護者の方はお子様のアカウントでログインして申し込んでください。保護者の方の希望はお子様のアカウント1つにつき1件です。",
      "観覧人数は1日につき2名まで選べます。",
    ],
    parentNotes: [
      "この抽選に申し込めるのは、お子様が開拓部門（3・4年生）に在籍している保護者の方のみです。",
      "申し込めるのは、お子様の所属するクラスの公演のみです。",
    ],
    applicantTypes: ["parent"],
    eligibleClasses: KAITAKU_CLASSES,
    canStaffApply: false,
    acts: KAITAKU_PERFORMANCES,
    slots: FESTIVAL_DAYS.map((day) => ({
      id: day.id,
      label: `${day.label}の公演`,
    })),
    opensAt: new Date("2026-07-17T00:00:00+09:00"),
    // Exclusive bound: the whole of Aug 25 JST is accepted (8月25日まで).
    closesAt: new Date("2026-08-26T00:00:00+09:00"),
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
      })),
    ),
    opensAt: new Date("2026-07-17T00:00:00+09:00"),
    // Exclusive bound: the whole of Aug 25 JST is accepted (8月25日まで).
    closesAt: new Date("2026-08-26T00:00:00+09:00"),
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

export function getLottery(lotteryId: string): Lottery | null {
  return LOTTERIES.find((lottery) => lottery.id === lotteryId) ?? null;
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
