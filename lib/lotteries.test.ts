import { describe, expect, it } from "vitest";

import { CLASSNAMES } from "@/db/schema";
import {
  areLotteryResultsAnnounced,
  canApplyToLottery,
  canTransferTicket,
  classFromRoles,
  describeApplicationDeadline,
  describeEligibleGrades,
  describeResultsAnnouncement,
  describeTicketTransferBlock,
  describeTicketTransferDeadline,
  getActLabel,
  getLottery,
  getLotteryAvailability,
  getSlotLabel,
  getSlotTime,
  getTicketStartsAt,
  isEligibleForLottery,
  LOTTERIES,
  type Lottery,
  MAX_CHOICES_PER_SLOT,
  MAX_PARTY_SIZE_BY_APPLICANT_TYPE,
  parseLotteryEntries,
  TICKET_TRANSFER_CLOSES_BEFORE_START_MS,
  TRANSFERABLE_APPLICANT_TYPES,
  type TransferableTicket,
} from "@/lib/lotteries";

// Role sets as 2026-account-generator's users.sql grants them: students get
// grade + class + Students, staff get Teachers. Committee roles ride along
// on some accounts and must not affect eligibility.
function studentRoles(classCode: string): string[] {
  return [`G${classCode[0]}`, `Class${classCode[1]}`, "Students"];
}
const TEACHER_ROLES = ["Teachers"];

function mustGetLottery(lotteryId: string): Lottery {
  const lottery = getLottery(lotteryId);
  if (lottery === null) throw new Error(`missing lottery: ${lotteryId}`);
  return lottery;
}

const kaitaku = mustGetLottery("kaitaku-performance");
const sousaku = mustGetLottery("sousaku-performance");

describe("LOTTERIES registry", () => {
  it("has unique lottery ids", () => {
    const ids = LOTTERIES.map((lottery) => lottery.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique slot ids and act ids within each lottery", () => {
    for (const lottery of LOTTERIES) {
      const slotIds = lottery.slots.map((slot) => slot.id);
      expect(new Set(slotIds).size).toBe(slotIds.length);
      const actIds = lottery.acts.map((act) => act.id);
      expect(new Set(actIds).size).toBe(actIds.length);
    }
  });

  it("allows up to three choices per slot", () => {
    expect(MAX_CHOICES_PER_SLOT).toBe(3);
  });

  // The exact dates are operations, not behavior — they change as the event
  // approaches (and get toggled to preview UI states), so only the presence
  // of a deadline is pinned here.
  it("has an application deadline configured for both lotteries", () => {
    expect(kaitaku.closesAt).toBeInstanceOf(Date);
    expect(sousaku.closesAt).toBeInstanceOf(Date);
  });

  it("asks kaitaku parents one question per festival day: rank the 8 performances", () => {
    // A kaitaku slot is a whole festival day, so it carries `date` and the
    // ACTS carry the clock — getTicketStartsAt() combines the two.
    expect(kaitaku.slots).toEqual([
      { id: "sep12", label: "9月12日（土）の公演", date: "2026-09-12" },
      { id: "sep13", label: "9月13日（日）の公演", date: "2026-09-13" },
    ]);
    expect(kaitaku.acts).toEqual([
      {
        id: "performance-1",
        label: "第一公演（8:45～9:15）",
        startTime: "08:45",
      },
      {
        id: "performance-2",
        label: "第二公演（9:30～10:00）",
        startTime: "09:30",
      },
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
    ]);
  });

  it("repeats the announced sousaku timetable on both festival days", () => {
    // Each sousaku slot IS one timed performance, so the slot itself
    // carries `startsAt` — the clock a ticket's transfer deadline is
    // measured from.
    expect(sousaku.slots).toEqual([
      {
        id: "sep12-slot-1",
        label: "9月12日（土）第一公演",
        time: "8:45～10:00",
        startsAt: new Date("2026-09-12T08:45:00+09:00"),
      },
      {
        id: "sep12-slot-2",
        label: "9月12日（土）第二公演",
        time: "10:20～11:35",
        startsAt: new Date("2026-09-12T10:20:00+09:00"),
      },
      {
        id: "sep12-slot-3",
        label: "9月12日（土）第三公演",
        time: "12:30～13:45",
        startsAt: new Date("2026-09-12T12:30:00+09:00"),
      },
      {
        id: "sep12-slot-4",
        label: "9月12日（土）第四公演",
        time: "14:05～15:20",
        startsAt: new Date("2026-09-12T14:05:00+09:00"),
      },
      {
        id: "sep13-slot-1",
        label: "9月13日（日）第一公演",
        time: "8:45～10:00",
        startsAt: new Date("2026-09-13T08:45:00+09:00"),
      },
      {
        id: "sep13-slot-2",
        label: "9月13日（日）第二公演",
        time: "10:20～11:35",
        startsAt: new Date("2026-09-13T10:20:00+09:00"),
      },
      {
        id: "sep13-slot-3",
        label: "9月13日（日）第三公演",
        time: "12:30～13:45",
        startsAt: new Date("2026-09-13T12:30:00+09:00"),
      },
      {
        id: "sep13-slot-4",
        label: "9月13日（日）第四公演",
        time: "14:05～15:20",
        startsAt: new Date("2026-09-13T14:05:00+09:00"),
      },
    ]);
  });

  it("lets parents bring up to two people, 本人 entries exactly one", () => {
    expect(MAX_PARTY_SIZE_BY_APPLICANT_TYPE).toEqual({
      student: 1,
      parent: 2,
    });
  });

  it("offers the sousaku classes (grades 5-6) as sousaku acts", () => {
    expect(sousaku.acts.map((act) => act.id)).toEqual([
      "5A",
      "5B",
      "5C",
      "5D",
      "6A",
      "6B",
      "6C",
      "6D",
    ]);
    expect(sousaku.acts[0].label).toBe("5年A組");
  });

  it("restricts kaitaku to parents of grade 3-4 classes, no staff", () => {
    expect(kaitaku.applicantTypes).toEqual(["parent"]);
    expect(kaitaku.canStaffApply).toBe(false);
    expect(kaitaku.eligibleClasses).toEqual([
      "3A",
      "3B",
      "3C",
      "3D",
      "4A",
      "4B",
      "4C",
      "4D",
    ]);
  });

  it("opens sousaku to all students, all parents, and staff", () => {
    expect(sousaku.applicantTypes).toEqual(["student", "parent"]);
    expect(sousaku.canStaffApply).toBe(true);
    expect(sousaku.eligibleClasses).toEqual([...CLASSNAMES]);
  });

  it("carries the important parent-facing notes for both lotteries", () => {
    // Sousaku explains the child's-class priority and its scope.
    const sousakuNotes = (sousaku.parentNotes ?? []).join("");
    expect(sousakuNotes).toContain("第1希望");
    expect(sousakuNotes).toContain("創作部門");
    // Kaitaku states that only its own division's parents may apply.
    const kaitakuNotes = (kaitaku.parentNotes ?? []).join("");
    expect(kaitakuNotes).toContain("開拓部門");
  });
});

describe("lottery result announcement", () => {
  function withAnnouncement(lottery: Lottery, at: Date | null): Lottery {
    return { ...lottery, resultsAnnouncedAt: at };
  }

  // The configured instant is committee policy and changes when they
  // announce, so these pin the BEHAVIOUR, never the value in LOTTERIES.
  it("hides results while no announcement time is configured", () => {
    for (const lottery of LOTTERIES) {
      expect(
        areLotteryResultsAnnounced(
          withAnnouncement(lottery, null),
          new Date("2099-01-01"),
        ),
      ).toBe(false);
    }
  });

  it("gives every lottery an announcement field to switch on", () => {
    for (const lottery of LOTTERIES) {
      expect(
        lottery.resultsAnnouncedAt === null ||
          lottery.resultsAnnouncedAt instanceof Date,
      ).toBe(true);
    }
  });

  it("publishes from the announced instant onwards, not before", () => {
    const at = new Date("2026-09-08T10:00:00+09:00");
    const lottery = withAnnouncement(sousaku, at);
    expect(
      areLotteryResultsAnnounced(lottery, new Date(at.getTime() - 1)),
    ).toBe(false);
    expect(areLotteryResultsAnnounced(lottery, at)).toBe(true);
    expect(
      areLotteryResultsAnnounced(lottery, new Date(at.getTime() + 1)),
    ).toBe(true);
  });

  it("describes the announcement in JST regardless of the server clock", () => {
    const lottery = withAnnouncement(
      sousaku,
      new Date("2026-09-08T10:00:00+09:00"),
    );
    const described = describeResultsAnnouncement(lottery);
    expect(described).toContain("2026");
    expect(described).toContain("9月8日");
    expect(described).toContain("10:00");
    expect(describeResultsAnnouncement(withAnnouncement(sousaku, null))).toBe(
      null,
    );
  });
});

describe("label lookups for stored ids", () => {
  it("renders a sousaku result's slot and act", () => {
    expect(getSlotLabel(sousaku, "sep12-slot-1")).toBe("9月12日（土）第一公演");
    expect(getSlotTime(sousaku, "sep12-slot-1")).toBe("8:45～10:00");
    expect(getActLabel(sousaku, "6A")).toBe("6年A組");
  });

  it("renders a kaitaku result's slot and act", () => {
    expect(getSlotLabel(kaitaku, "sep13")).toBe("9月13日（日）の公演");
    expect(getSlotTime(kaitaku, "sep13")).toBeNull();
    expect(getActLabel(kaitaku, "performance-3")).toBe(
      "第三公演（10:15～10:45）",
    );
  });

  it("falls back to the raw id when the definition no longer knows it", () => {
    expect(getSlotLabel(sousaku, "sep14-slot-9")).toBe("sep14-slot-9");
    expect(getActLabel(sousaku, "7A")).toBe("7A");
    expect(getSlotTime(sousaku, "sep14-slot-9")).toBeNull();
  });
});

describe("getLottery", () => {
  it("returns the lottery for a known id", () => {
    expect(getLottery("kaitaku-performance")).toBe(kaitaku);
  });

  it("returns null for an unknown id", () => {
    expect(getLottery("nose-flute-performance")).toBeNull();
  });
});

describe("classFromRoles", () => {
  it("derives the class from one grade role plus one class role", () => {
    expect(classFromRoles(["G4", "ClassD", "Students"])).toBe("4D");
    expect(classFromRoles(["G1", "ClassA", "Students"])).toBe("1A");
  });

  it("ignores committee and other unrelated roles", () => {
    expect(classFromRoles(["Sousakuten", "G4", "ClassD", "Students"])).toBe(
      "4D",
    );
  });

  it("returns null without exactly one grade and one class role", () => {
    expect(classFromRoles([])).toBeNull();
    expect(classFromRoles(["Students"])).toBeNull();
    expect(classFromRoles(["G4", "Students"])).toBeNull();
    expect(classFromRoles(["ClassD", "Students"])).toBeNull();
    expect(classFromRoles(["G3", "G4", "ClassD", "Students"])).toBeNull();
    expect(classFromRoles(["G4", "ClassC", "ClassD", "Students"])).toBeNull();
  });
});

describe("isEligibleForLottery", () => {
  it("accepts a kaitaku-class account for the kaitaku lottery", () => {
    expect(isEligibleForLottery(kaitaku, studentRoles("3A"))).toBe(true);
    expect(isEligibleForLottery(kaitaku, studentRoles("4D"))).toBe(true);
  });

  it("judges by roles alone, so an alias granted its base account's roles passes", () => {
    // e.g. "4D11_sakuten" carrying the same roles as "4D11" — such aliases
    // can hold a second entry set; only grant them roles where acceptable.
    expect(
      isEligibleForLottery(kaitaku, ["Sousakuten", "G4", "ClassD", "Students"]),
    ).toBe(true);
  });

  it("rejects accounts of other divisions for the kaitaku lottery", () => {
    expect(isEligibleForLottery(kaitaku, studentRoles("2A"))).toBe(false);
    expect(isEligibleForLottery(kaitaku, studentRoles("5A"))).toBe(false);
  });

  it("accepts Teachers accounts only where canStaffApply is set", () => {
    expect(isEligibleForLottery(sousaku, TEACHER_ROLES)).toBe(true);
    expect(isEligibleForLottery(kaitaku, TEACHER_ROLES)).toBe(false);
  });

  it("rejects role-less and committee-only accounts", () => {
    expect(isEligibleForLottery(sousaku, [])).toBe(false);
    expect(isEligibleForLottery(sousaku, ["IT"])).toBe(false);
    expect(isEligibleForLottery(sousaku, ["Sousakuten"])).toBe(false);
  });

  it("rejects a Students account whose roles pin no single class", () => {
    expect(isEligibleForLottery(sousaku, ["Students"])).toBe(false);
    expect(isEligibleForLottery(sousaku, ["G4", "Students"])).toBe(false);
  });

  it("accepts every grade's students for the sousaku lottery", () => {
    expect(isEligibleForLottery(sousaku, studentRoles("1A"))).toBe(true);
    expect(isEligibleForLottery(sousaku, studentRoles("6D"))).toBe(true);
  });
});

describe("canApplyToLottery", () => {
  it("rejects an applicant type the lottery does not offer", () => {
    expect(canApplyToLottery(kaitaku, studentRoles("3A"), "student")).toBe(
      false,
    );
  });

  it("accepts an offered applicant type for an eligible account", () => {
    expect(canApplyToLottery(kaitaku, studentRoles("3A"), "parent")).toBe(true);
    expect(canApplyToLottery(sousaku, studentRoles("1A"), "student")).toBe(
      true,
    );
    expect(canApplyToLottery(sousaku, studentRoles("1A"), "parent")).toBe(true);
  });

  it("lets staff apply only as themselves, never as a parent", () => {
    expect(canApplyToLottery(sousaku, TEACHER_ROLES, "student")).toBe(true);
    expect(canApplyToLottery(sousaku, TEACHER_ROLES, "parent")).toBe(false);
    expect(canApplyToLottery(kaitaku, TEACHER_ROLES, "parent")).toBe(false);
  });

  it("rejects an ineligible account even for an offered type", () => {
    expect(canApplyToLottery(kaitaku, studentRoles("5A"), "parent")).toBe(
      false,
    );
  });
});

describe("getLotteryAvailability", () => {
  const now = new Date("2026-09-20T12:00:00+09:00");

  function withWindow(opensAt: Date | null, closesAt: Date | null): Lottery {
    return { ...kaitaku, opensAt, closesAt };
  }

  it("is open when no window is configured", () => {
    expect(getLotteryAvailability(withWindow(null, null), now)).toBe("open");
  });

  it("is upcoming before opensAt and open from opensAt onwards", () => {
    const opensAt = new Date(now.getTime() + 1000);
    expect(getLotteryAvailability(withWindow(opensAt, null), now)).toBe(
      "upcoming",
    );
    expect(getLotteryAvailability(withWindow(now, null), now)).toBe("open");
  });

  it("is closed from closesAt onwards", () => {
    const closesAt = new Date(now.getTime() - 1000);
    expect(getLotteryAvailability(withWindow(null, closesAt), now)).toBe(
      "closed",
    );
    expect(getLotteryAvailability(withWindow(null, now), now)).toBe("closed");
    expect(
      getLotteryAvailability(
        withWindow(null, new Date(now.getTime() + 1000)),
        now,
      ),
    ).toBe("open");
  });
});

describe("describeApplicationDeadline", () => {
  // Fixture dates, not the live config — this pins the formatter, not the
  // currently configured deadline.
  it("renders the last accepted day in JST from the exclusive bound", () => {
    const fixture = {
      ...kaitaku,
      closesAt: new Date("2026-08-31T00:00:00+09:00"),
    };
    expect(describeApplicationDeadline(fixture)).toBe(
      "2026年8月30日（日）まで",
    );
  });

  it("returns null when no deadline is configured", () => {
    expect(describeApplicationDeadline({ ...kaitaku, closesAt: null })).toBe(
      null,
    );
  });
});

describe("describeEligibleGrades", () => {
  it("lists the grades for a division lottery", () => {
    expect(describeEligibleGrades(kaitaku)).toBe("3・4年生");
  });

  it("collapses all six grades to 全学年", () => {
    expect(describeEligibleGrades(sousaku)).toBe("全学年");
  });
});

describe("parseLotteryEntries", () => {
  it("keeps ranked choices and 観覧人数 for a fully filled slot", () => {
    const result = parseLotteryEntries(
      sousaku,
      [{ slotId: "sep12-slot-1", choices: ["5A", "5B", "6C"], partySize: "2" }],
      2,
    );
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          slotId: "sep12-slot-1",
          firstChoice: "5A",
          secondChoice: "5B",
          thirdChoice: "6C",
          partySize: 2,
        },
      ],
    });
  });

  it("parses kaitaku's per-day questions as ranked performances", () => {
    const result = parseLotteryEntries(
      kaitaku,
      [
        {
          slotId: "sep12",
          choices: ["performance-3", "performance-6", ""],
          partySize: "2",
        },
        {
          slotId: "sep13",
          choices: ["performance-1", "", ""],
          partySize: "1",
        },
      ],
      2,
    );
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          slotId: "sep12",
          firstChoice: "performance-3",
          secondChoice: "performance-6",
          thirdChoice: null,
          partySize: 2,
        },
        {
          slotId: "sep13",
          firstChoice: "performance-1",
          secondChoice: null,
          thirdChoice: null,
          partySize: 1,
        },
      ],
    });
  });

  it("compacts gaps upward (a 1st + 3rd choice becomes 1st + 2nd)", () => {
    const result = parseLotteryEntries(
      sousaku,
      [{ slotId: "sep12-slot-1", choices: ["5A", "", "5B"], partySize: "1" }],
      2,
    );
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          slotId: "sep12-slot-1",
          firstChoice: "5A",
          secondChoice: "5B",
          thirdChoice: null,
          partySize: 1,
        },
      ],
    });
  });

  it("promotes a lone 2nd-rank choice to the 1st choice", () => {
    const result = parseLotteryEntries(
      sousaku,
      [{ slotId: "sep13-slot-2", choices: ["", "6A", ""], partySize: "1" }],
      2,
    );
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          slotId: "sep13-slot-2",
          firstChoice: "6A",
          secondChoice: null,
          thirdChoice: null,
          partySize: 1,
        },
      ],
    });
  });

  it("skips slots with no choices and keeps slot submission order", () => {
    const result = parseLotteryEntries(
      sousaku,
      [
        { slotId: "sep12-slot-1", choices: ["5A", "", ""], partySize: "1" },
        { slotId: "sep12-slot-2", choices: ["", "", ""], partySize: "1" },
        { slotId: "sep13-slot-3", choices: ["6B", "", ""], partySize: "1" },
      ],
      2,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => entry.slotId)).toEqual([
      "sep12-slot-1",
      "sep13-slot-3",
    ]);
  });

  it("returns no entries for an all-blank submission, ignoring 人数", () => {
    const result = parseLotteryEntries(
      sousaku,
      [{ slotId: "sep12-slot-1", choices: ["", "", ""], partySize: "" }],
      2,
    );
    expect(result).toEqual({ ok: true, entries: [] });
  });

  it("rejects an unknown slot id", () => {
    const result = parseLotteryEntries(
      sousaku,
      [{ slotId: "slot-99", choices: ["5A", "", ""], partySize: "1" }],
      2,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("不正な公演");
  });

  it("rejects a slot submitted twice", () => {
    const result = parseLotteryEntries(
      sousaku,
      [
        { slotId: "sep12-slot-1", choices: ["5A", "", ""], partySize: "1" },
        { slotId: "sep12-slot-1", choices: ["5B", "", ""], partySize: "1" },
      ],
      2,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects more ranks than MAX_CHOICES_PER_SLOT", () => {
    const result = parseLotteryEntries(
      sousaku,
      [
        {
          slotId: "sep12-slot-1",
          choices: ["5A", "5B", "5C", "5D"],
          partySize: "1",
        },
      ],
      2,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(`${MAX_CHOICES_PER_SLOT}件まで`);
  });

  it("rejects an act the lottery does not offer, naming the slot", () => {
    const result = parseLotteryEntries(
      sousaku,
      [{ slotId: "sep12-slot-2", choices: ["3A", "", ""], partySize: "1" }],
      2,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("9月12日（土）第二公演");
    expect(result.error).toContain("不正な選択肢");
  });

  it("rejects a class code where kaitaku expects a performance", () => {
    const result = parseLotteryEntries(
      kaitaku,
      [{ slotId: "sep12", choices: ["3A", "", ""], partySize: "1" }],
      2,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("9月12日（土）の公演");
    expect(result.error).toContain("不正な選択肢");
  });

  it("rejects the same act at two ranks of one slot, naming the slot", () => {
    const result = parseLotteryEntries(
      sousaku,
      [{ slotId: "sep12-slot-1", choices: ["5A", "5A", ""], partySize: "1" }],
      2,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("第一公演");
    expect(result.error).toContain("同じ選択肢");
  });

  it("rejects an out-of-range or non-numeric 観覧人数", () => {
    for (const partySize of ["0", "3", "1.5", "abc", ""]) {
      const result = parseLotteryEntries(
        sousaku,
        [{ slotId: "sep12-slot-1", choices: ["5A", "", ""], partySize }],
        2,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toContain("観覧人数");
    }
  });

  it("caps 観覧人数 at the caller's maximum (本人 = 1)", () => {
    const result = parseLotteryEntries(
      sousaku,
      [{ slotId: "sep12-slot-1", choices: ["5A", "", ""], partySize: "2" }],
      1,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("観覧人数");
  });
});

// A 本人 seat, the only 区分 that may change hands. Tests that care about a
// different slot/act override those fields.
function studentTicket(
  overrides: Partial<TransferableTicket> = {},
): TransferableTicket {
  return {
    slotId: "sep12-slot-1",
    actId: "6A",
    applicantType: "student",
    ...overrides,
  };
}

describe("当選チケットの譲渡可否", () => {
  it("lets a 本人 seat change hands and never a 保護者 one", () => {
    expect(TRANSFERABLE_APPLICANT_TYPES).toEqual(["student"]);
    const now = new Date("2026-09-01T12:00:00+09:00");

    expect(canTransferTicket(sousaku, studentTicket(), now)).toBe(true);
    expect(
      canTransferTicket(
        sousaku,
        studentTicket({ applicantType: "parent" }),
        now,
      ),
    ).toBe(false);
  });

  it("makes the whole 開拓部門 lottery non-transferable, since it is parent-only", () => {
    expect(kaitaku.applicantTypes).toEqual(["parent"]);
    const now = new Date("2026-09-01T12:00:00+09:00");
    for (const act of kaitaku.acts) {
      for (const slot of kaitaku.slots) {
        expect(
          canTransferTicket(
            kaitaku,
            { slotId: slot.id, actId: act.id, applicantType: "parent" },
            now,
          ),
        ).toBe(false);
      }
    }
  });

  it("says which 区分 is refused, and points at 破棄 instead", () => {
    const blocked = describeTicketTransferBlock(
      sousaku,
      studentTicket({ applicantType: "parent" }),
      new Date("2026-09-01T12:00:00+09:00"),
    );
    expect(blocked).toContain("保護者");
    expect(blocked).toContain("破棄");
  });

  it("refuses a 保護者 seat on the 区分 rule even long before the performance", () => {
    // The two rules are independent: the 区分 one is not a deadline in
    // disguise, so it holds at any clock reading.
    expect(
      canTransferTicket(
        sousaku,
        studentTicket({ applicantType: "parent" }),
        new Date("2026-01-01T00:00:00+09:00"),
      ),
    ).toBe(false);
  });
});

describe("当選チケットの譲渡期限", () => {
  // 創作部門: the SLOT is one timed performance, so the clock is on the slot
  // and the act (which class) does not move it.
  it("reads a sousaku seat's start off its slot", () => {
    expect(getTicketStartsAt(sousaku, "sep12-slot-2", "6A")).toEqual(
      new Date("2026-09-12T10:20:00+09:00"),
    );
    expect(getTicketStartsAt(sousaku, "sep13-slot-4", "5C")).toEqual(
      new Date("2026-09-13T14:05:00+09:00"),
    );
  });

  it("ignores which class a sousaku seat is for", () => {
    expect(getTicketStartsAt(sousaku, "sep12-slot-1", "5A")).toEqual(
      getTicketStartsAt(sousaku, "sep12-slot-1", "6D"),
    );
  });

  // 開拓部門: the SLOT is a whole festival day and the ACT is the timed
  // performance, so both halves are needed.
  it("combines a kaitaku seat's day with the performance it won", () => {
    expect(getTicketStartsAt(kaitaku, "sep12", "performance-1")).toEqual(
      new Date("2026-09-12T08:45:00+09:00"),
    );
    expect(getTicketStartsAt(kaitaku, "sep13", "performance-8")).toEqual(
      new Date("2026-09-13T14:45:00+09:00"),
    );
  });

  it("gives the same performance a different instant on each day", () => {
    expect(getTicketStartsAt(kaitaku, "sep12", "performance-5")).not.toEqual(
      getTicketStartsAt(kaitaku, "sep13", "performance-5"),
    );
  });

  it("has no start for ids the definition no longer knows", () => {
    expect(getTicketStartsAt(sousaku, "sep12-slot-9", "6A")).toBeNull();
    expect(getTicketStartsAt(kaitaku, "sep12", "performance-99")).toBeNull();
  });

  it("closes transfers 10 minutes before the performance, ahead of 受付", () => {
    // Earlier than the 5-minute 受付 deadline on purpose, so a seat handed
    // over at the last moment still leaves its new holder time to arrive.
    expect(TICKET_TRANSFER_CLOSES_BEFORE_START_MS).toBe(10 * 60 * 1000);
    const startsAt = new Date("2026-09-12T10:20:00+09:00");
    const deadline = new Date(
      startsAt.getTime() - TICKET_TRANSFER_CLOSES_BEFORE_START_MS,
    );
    const ticket = studentTicket({ slotId: "sep12-slot-2" });

    expect(
      canTransferTicket(sousaku, ticket, new Date(deadline.getTime() - 1)),
    ).toBe(true);
    expect(canTransferTicket(sousaku, ticket, deadline)).toBe(false);
    expect(canTransferTicket(sousaku, ticket, startsAt)).toBe(false);
  });

  it("closes each seat on its own performance, not festival-wide", () => {
    // Mid-morning on day 1: the first performance has been and gone, the
    // fourth (and all of day 2) is still freely transferable.
    const now = new Date("2026-09-12T11:00:00+09:00");
    expect(
      canTransferTicket(
        sousaku,
        studentTicket({ slotId: "sep12-slot-1" }),
        now,
      ),
    ).toBe(false);
    expect(
      canTransferTicket(
        sousaku,
        studentTicket({ slotId: "sep12-slot-4" }),
        now,
      ),
    ).toBe(true);
    expect(
      canTransferTicket(
        sousaku,
        studentTicket({ slotId: "sep13-slot-1" }),
        now,
      ),
    ).toBe(true);
    // 開拓部門 is blocked by 区分 anyway; the clock is checked here through a
    // 本人 seat so the two rules stay separable.
    expect(
      getTicketStartsAt(kaitaku, "sep12", "performance-2")!.getTime(),
    ).toBeLessThan(now.getTime());
    expect(
      getTicketStartsAt(kaitaku, "sep12", "performance-7")!.getTime(),
    ).toBeGreaterThan(now.getTime());
  });

  it("imposes no deadline when the definition carries no clock", () => {
    // Same "null means no bound" rule as opensAt / closesAt.
    expect(
      canTransferTicket(
        sousaku,
        studentTicket({ slotId: "sep12-slot-9" }),
        new Date("2030-01-01"),
      ),
    ).toBe(true);
    expect(describeTicketTransferDeadline(sousaku, "sep12-slot-9", "6A")).toBe(
      null,
    );
  });

  it("describes the deadline in JST, whatever the server's timezone", () => {
    expect(describeTicketTransferDeadline(sousaku, "sep12-slot-1", "6A")).toBe(
      // 8:45 start − 10 min.
      "2026年9月12日（土）08:35",
    );
    expect(
      // 10:15 start − 10 min.
      describeTicketTransferDeadline(kaitaku, "sep13", "performance-3"),
    ).toBe("2026年9月13日（日）10:05");
  });
});
