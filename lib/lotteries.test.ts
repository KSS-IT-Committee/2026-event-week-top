import { describe, expect, it } from "vitest";

import { CLASSNAMES } from "@/db/schema";
import {
  canApplyToLottery,
  describeApplicationDeadline,
  describeEligibleGrades,
  getLottery,
  getLotteryAvailability,
  isEligibleForLottery,
  LOTTERIES,
  type Lottery,
  MAX_CHOICES_PER_SLOT,
  MAX_PARTY_SIZE_BY_APPLICANT_TYPE,
  parseLotteryEntries,
} from "@/lib/lotteries";

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
    expect(kaitaku.slots).toEqual([
      { id: "sep12", label: "9月12日（土）の公演" },
      { id: "sep13", label: "9月13日（日）の公演" },
    ]);
    expect(kaitaku.acts).toEqual([
      { id: "performance-1", label: "第一公演（8:45～9:15）" },
      { id: "performance-2", label: "第二公演（9:30～10:00）" },
      { id: "performance-3", label: "第三公演（10:15～10:45）" },
      { id: "performance-4", label: "第四公演（11:00～11:30）" },
      { id: "performance-5", label: "第五公演（12:30～13:00）" },
      { id: "performance-6", label: "第六公演（13:15～13:45）" },
      { id: "performance-7", label: "第七公演（14:00～14:30）" },
      { id: "performance-8", label: "第八公演（14:45～15:15）" },
    ]);
  });

  it("repeats the announced sousaku timetable on both festival days", () => {
    expect(sousaku.slots).toEqual([
      {
        id: "sep12-slot-1",
        label: "9月12日（土）第一公演",
        time: "8:45～10:00",
      },
      {
        id: "sep12-slot-2",
        label: "9月12日（土）第二公演",
        time: "10:20～11:35",
      },
      {
        id: "sep12-slot-3",
        label: "9月12日（土）第三公演",
        time: "12:30～13:45",
      },
      {
        id: "sep12-slot-4",
        label: "9月12日（土）第四公演",
        time: "14:05～15:20",
      },
      {
        id: "sep13-slot-1",
        label: "9月13日（日）第一公演",
        time: "8:45～10:00",
      },
      {
        id: "sep13-slot-2",
        label: "9月13日（日）第二公演",
        time: "10:20～11:35",
      },
      {
        id: "sep13-slot-3",
        label: "9月13日（日）第三公演",
        time: "12:30～13:45",
      },
      {
        id: "sep13-slot-4",
        label: "9月13日（日）第四公演",
        time: "14:05～15:20",
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

describe("getLottery", () => {
  it("returns the lottery for a known id", () => {
    expect(getLottery("kaitaku-performance")).toBe(kaitaku);
  });

  it("returns null for an unknown id", () => {
    expect(getLottery("nose-flute-performance")).toBeNull();
  });
});

describe("isEligibleForLottery", () => {
  it("accepts a kaitaku-class account for the kaitaku lottery", () => {
    expect(isEligibleForLottery(kaitaku, "3A05")).toBe(true);
    expect(isEligibleForLottery(kaitaku, "4D11")).toBe(true);
  });

  it("rejects alias accounts (suffixed usernames) so one student cannot double-enter", () => {
    expect(isEligibleForLottery(kaitaku, "4D11_sakuten")).toBe(false);
    expect(isEligibleForLottery(sousaku, "1A01_test")).toBe(false);
  });

  it("rejects accounts of other divisions for the kaitaku lottery", () => {
    expect(isEligibleForLottery(kaitaku, "2A01")).toBe(false);
    expect(isEligibleForLottery(kaitaku, "5A01")).toBe(false);
  });

  it("accepts staff accounts only where canStaffApply is set", () => {
    expect(isEligibleForLottery(sousaku, "k0959176")).toBe(true);
    expect(isEligibleForLottery(kaitaku, "k0959176")).toBe(false);
  });

  it("rejects malformed staff usernames even on a staff lottery", () => {
    expect(isEligibleForLottery(sousaku, "k0959176_x")).toBe(false);
    expect(isEligibleForLottery(sousaku, "k095917")).toBe(false);
  });

  it("accepts every grade's students for the sousaku lottery", () => {
    expect(isEligibleForLottery(sousaku, "1A01")).toBe(true);
    expect(isEligibleForLottery(sousaku, "6D01")).toBe(true);
  });
});

describe("canApplyToLottery", () => {
  it("rejects an applicant type the lottery does not offer", () => {
    expect(canApplyToLottery(kaitaku, "3A05", "student")).toBe(false);
  });

  it("accepts an offered applicant type for an eligible account", () => {
    expect(canApplyToLottery(kaitaku, "3A05", "parent")).toBe(true);
    expect(canApplyToLottery(sousaku, "1A01", "student")).toBe(true);
    expect(canApplyToLottery(sousaku, "1A01", "parent")).toBe(true);
  });

  it("lets staff apply only as themselves, never as a parent", () => {
    expect(canApplyToLottery(sousaku, "k0959176", "student")).toBe(true);
    expect(canApplyToLottery(sousaku, "k0959176", "parent")).toBe(false);
    expect(canApplyToLottery(kaitaku, "k0959176", "parent")).toBe(false);
  });

  it("rejects an ineligible account even for an offered type", () => {
    expect(canApplyToLottery(kaitaku, "5A01", "parent")).toBe(false);
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
