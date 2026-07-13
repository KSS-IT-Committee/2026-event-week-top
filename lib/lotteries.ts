import {
  type ClassName,
  CLASSNAMES,
  isClassName,
  type LotteryApplicantType,
} from "@/db/schema";
import { classOf } from "@/lib/user-category";

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
  // Which kinds of applicant may enter, in display order. Parents apply via
  // their child's student account, so "parent" still authenticates as the
  // child; one account holds at most one entry set per type.
  applicantTypes: readonly LotteryApplicantType[];
  // The account's class (classOf(username)) must be one of these. For
  // parents this is the child's class — "parents with a child in the
  // division" is exactly "accounts of that division's classes".
  eligibleClasses: readonly ClassName[];
  // Whether staff (k-prefixed) accounts may enter. Staff have no class, so
  // eligibleClasses never admits them; they apply as themselves via the
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

// Exactly one base student account per student (e.g. "3A05"). Deliberately
// stricter than lib/user-category.ts's prefix-matching STUDENT_RE: alias
// accounts like "4D11_sakuten" must not hold a second entry set on top of
// the base account's, so lottery eligibility requires the exact form.
const BASE_STUDENT_RE = /^[1-6][A-D]\d{2}$/;

// Staff accounts: exactly k + 7 digits. Mirrors TEACHER_RE in
// lib/user-category.ts (unexported there, and that file is byte-identical
// across the four apps, so it must not change). Anchored for the same
// one-account-one-entry-set reason as BASE_STUDENT_RE.
const STAFF_RE = /^k\d{7}$/;

function classesInGrades(grades: readonly string[]): ClassName[] {
  return CLASSNAMES.filter((className) => grades.includes(className[0]));
}

// 「3A」→「3年A組」 — the acts are the division's class plays.
function actForClass(className: ClassName): LotteryAct {
  return { id: className, label: `${className[0]}年${className[1]}組` };
}

const KAITAKU_CLASSES = classesInGrades(["3", "4"]);
const SOUSAKU_CLASSES = classesInGrades(["5", "6"]);

// 開拓部門: a parent ranks WHICH performance (time slot) to attend, not
// which class — so the ranked choices are the performances themselves,
// asked as one single-slot question.
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

export const LOTTERIES: readonly Lottery[] = [
  {
    id: "kaitaku-performance",
    title: "開拓部門公演 観覧抽選",
    description:
      "開拓部門（3・4年生）のクラス劇の観覧抽選です。開拓部門の生徒の保護者の方が対象で、観覧を希望する公演（時間帯）を第1〜第3希望まで選べます。",
    notes: [
      "公演時間は30分、幕間は15分です。",
      "お昼休憩は60分です。第四公演のお客さんがはけ次第、12:15まで観客入場禁止となります。",
      "保護者の方はお子様のアカウントでログインして申し込んでください。保護者の方の希望はお子様のアカウント1つにつき1件です。",
    ],
    applicantTypes: ["parent"],
    eligibleClasses: KAITAKU_CLASSES,
    canStaffApply: false,
    acts: KAITAKU_PERFORMANCES,
    slots: [{ id: "preferred-slot", label: "観覧を希望する公演" }],
    opensAt: null,
    // 令和8年8月30日（日）まで (per the parent letter): exclusive bound at the
    // JST midnight that ends Aug 30.
    closesAt: new Date("2026-08-31T00:00:00+09:00"),
  },
  {
    id: "sousaku-performance",
    title: "創作部門公演 観覧抽選",
    description:
      "創作部門（5・6年生）のクラス劇の観覧抽選です。全学年の生徒・保護者の方と教職員の方が対象で、公演ごとに観たいクラスを第1〜第3希望まで選べます。",
    notes: [
      "公演時間は75分、幕間は20分です。",
      "お昼休憩は55分です。第二公演のお客さんがはけ次第、12:15まで観客入場禁止となります。",
      "生徒本人と保護者の方は、同じアカウントからそれぞれ別に申し込めます。保護者の方の希望はお子様のアカウント1つにつき1件です。",
      "教職員の方はご自身のアカウントでログインして申し込んでください。",
    ],
    applicantTypes: ["student", "parent"],
    eligibleClasses: [...CLASSNAMES],
    canStaffApply: true,
    acts: SOUSAKU_CLASSES.map(actForClass),
    slots: [
      { id: "slot-1", label: "第一公演", time: "8:45～10:00" },
      { id: "slot-2", label: "第二公演", time: "10:20～11:35" },
      { id: "slot-3", label: "第三公演", time: "12:30～13:45" },
      { id: "slot-4", label: "第四公演", time: "14:05～15:20" },
    ],
    opensAt: null,
    // Same deadline as kaitaku — the parent letter announces one date for both.
    closesAt: new Date("2026-08-31T00:00:00+09:00"),
  },
];

// "student" reads 本人 (not 生徒本人): staff accounts also apply through it
// on lotteries with canStaffApply.
export const APPLICANT_TYPE_LABELS: Record<LotteryApplicantType, string> = {
  student: "本人",
  parent: "保護者",
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
 * Whether the account may take part in the lottery at all: either a staff
 * account on a lottery that admits staff, or a base student account
 * (aliases like "4D11_sakuten" are excluded so one student never yields two
 * entry sets) whose class (the child's class, for parents) is one of the
 * eligible classes. Committee and other non-matching accounts never pass.
 */
export function isEligibleForLottery(
  lottery: Lottery,
  username: string,
): boolean {
  if (STAFF_RE.test(username)) return lottery.canStaffApply;
  if (!BASE_STUDENT_RE.test(username)) return false;
  const classCode = classOf(username);
  if (classCode === null || !isClassName(classCode)) return false;
  return lottery.eligibleClasses.includes(classCode);
}

export function canApplyToLottery(
  lottery: Lottery,
  username: string,
  applicantType: LotteryApplicantType,
): boolean {
  if (!lottery.applicantTypes.includes(applicantType)) return false;
  // Staff apply as themselves only — there is no child behind a k-account
  // for a "parent" entry to belong to.
  if (applicantType === "parent" && STAFF_RE.test(username)) return false;
  return isEligibleForLottery(lottery, username);
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
};

// One slot's validated preferences, ready to insert.
export type LotteryEntryInput = {
  slotId: string;
  firstChoice: string;
  secondChoice: string | null;
  thirdChoice: string | null;
};

export type ParseLotteryEntriesResult =
  { ok: true; entries: LotteryEntryInput[] } | { ok: false; error: string };

/**
 * Validate raw per-slot rank inputs against a lottery definition and shape
 * them for storage. Gaps compact upward (a 1st + 3rd choice becomes 1st +
 * 2nd), a slot with no choices yields no entry (= not applying for it), and
 * unknown slots/acts or a repeated act within a slot reject the whole
 * submission with a user-facing message.
 */
export function parseLotteryEntries(
  lottery: Lottery,
  submissions: readonly SlotChoicesInput[],
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

    entries.push({
      slotId: slot.id,
      firstChoice: choices[0],
      secondChoice: choices[1] ?? null,
      thirdChoice: choices[2] ?? null,
    });
  }

  return { ok: true, entries };
}
