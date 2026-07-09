import { describe, expect, it } from "vitest";

import { CLASSNAMES } from "@/db/schema";
import {
  canApplyToLottery,
  describeEligibleGrades,
  getLottery,
  getLotteryAvailability,
  isEligibleForLottery,
  LOTTERIES,
  type Lottery,
  MAX_CHOICES_PER_SLOT,
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

  it("matches the announced kaitaku timetable (8 performances)", () => {
    expect(kaitaku.slots).toEqual([
      { id: "slot-1", label: "第一公演", time: "8:45～9:15" },
      { id: "slot-2", label: "第二公演", time: "9:30～10:00" },
      { id: "slot-3", label: "第三公演", time: "10:15～10:45" },
      { id: "slot-4", label: "第四公演", time: "11:00～11:30" },
      { id: "slot-5", label: "第五公演", time: "12:30～13:00" },
      { id: "slot-6", label: "第六公演", time: "13:15～13:45" },
      { id: "slot-7", label: "第七公演", time: "14:00～14:30" },
      { id: "slot-8", label: "第八公演", time: "14:45～15:15" },
    ]);
  });

  it("matches the announced sousaku timetable (4 performances)", () => {
    expect(sousaku.slots).toEqual([
      { id: "slot-1", label: "第一公演", time: "8:45～10:00" },
      { id: "slot-2", label: "第二公演", time: "10:20～11:35" },
      { id: "slot-3", label: "第三公演", time: "12:30～13:45" },
      { id: "slot-4", label: "第四公演", time: "14:05～15:20" },
    ]);
  });

  it("offers the kaitaku classes (grades 3-4) as kaitaku acts", () => {
    expect(kaitaku.acts.map((act) => act.id)).toEqual([
      "3A",
      "3B",
      "3C",
      "3D",
      "4A",
      "4B",
      "4C",
      "4D",
    ]);
    expect(kaitaku.acts[0].label).toBe("3年A組");
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
  });

  it("restricts kaitaku to parents of grade 3-4 classes", () => {
    expect(kaitaku.applicantTypes).toEqual(["parent"]);
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

  it("opens sousaku to all students and all parents", () => {
    expect(sousaku.applicantTypes).toEqual(["student", "parent"]);
    expect(sousaku.eligibleClasses).toEqual([...CLASSNAMES]);
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

  it("rejects staff accounts (no class) for every lottery", () => {
    expect(isEligibleForLottery(kaitaku, "k0959176")).toBe(false);
    expect(isEligibleForLottery(sousaku, "k0959176")).toBe(false);
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

  it("rejects an ineligible account even for an offered type", () => {
    expect(canApplyToLottery(kaitaku, "5A01", "parent")).toBe(false);
    expect(canApplyToLottery(sousaku, "k0959176", "parent")).toBe(false);
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

describe("describeEligibleGrades", () => {
  it("lists the grades for a division lottery", () => {
    expect(describeEligibleGrades(kaitaku)).toBe("3・4年生");
  });

  it("collapses all six grades to 全学年", () => {
    expect(describeEligibleGrades(sousaku)).toBe("全学年");
  });
});

describe("parseLotteryEntries", () => {
  it("keeps ranked choices for a fully filled slot", () => {
    const result = parseLotteryEntries(kaitaku, [
      { slotId: "slot-1", choices: ["3A", "3B", "4C"] },
    ]);
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          slotId: "slot-1",
          firstChoice: "3A",
          secondChoice: "3B",
          thirdChoice: "4C",
        },
      ],
    });
  });

  it("compacts gaps upward (a 1st + 3rd choice becomes 1st + 2nd)", () => {
    const result = parseLotteryEntries(kaitaku, [
      { slotId: "slot-1", choices: ["3A", "", "3B"] },
    ]);
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          slotId: "slot-1",
          firstChoice: "3A",
          secondChoice: "3B",
          thirdChoice: null,
        },
      ],
    });
  });

  it("promotes a lone 2nd-rank choice to the 1st choice", () => {
    const result = parseLotteryEntries(kaitaku, [
      { slotId: "slot-2", choices: ["", "4A", ""] },
    ]);
    expect(result).toEqual({
      ok: true,
      entries: [
        {
          slotId: "slot-2",
          firstChoice: "4A",
          secondChoice: null,
          thirdChoice: null,
        },
      ],
    });
  });

  it("skips slots with no choices and keeps slot submission order", () => {
    const result = parseLotteryEntries(kaitaku, [
      { slotId: "slot-1", choices: ["3A", "", ""] },
      { slotId: "slot-2", choices: ["", "", ""] },
      { slotId: "slot-3", choices: ["4B", "", ""] },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((entry) => entry.slotId)).toEqual([
      "slot-1",
      "slot-3",
    ]);
  });

  it("returns no entries for an all-blank submission", () => {
    const result = parseLotteryEntries(kaitaku, [
      { slotId: "slot-1", choices: ["", "", ""] },
    ]);
    expect(result).toEqual({ ok: true, entries: [] });
  });

  it("rejects an unknown slot id", () => {
    const result = parseLotteryEntries(kaitaku, [
      { slotId: "slot-99", choices: ["3A", "", ""] },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("不正な公演");
  });

  it("rejects a slot submitted twice", () => {
    const result = parseLotteryEntries(kaitaku, [
      { slotId: "slot-1", choices: ["3A", "", ""] },
      { slotId: "slot-1", choices: ["3B", "", ""] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects more ranks than MAX_CHOICES_PER_SLOT", () => {
    const result = parseLotteryEntries(kaitaku, [
      { slotId: "slot-1", choices: ["3A", "3B", "3C", "3D"] },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(`${MAX_CHOICES_PER_SLOT}件まで`);
  });

  it("rejects an act the lottery does not offer, naming the slot", () => {
    const result = parseLotteryEntries(sousaku, [
      { slotId: "slot-2", choices: ["3A", "", ""] },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("第二公演");
    expect(result.error).toContain("不正なクラス");
  });

  it("rejects the same act at two ranks of one slot, naming the slot", () => {
    const result = parseLotteryEntries(kaitaku, [
      { slotId: "slot-1", choices: ["3A", "3A", ""] },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("第一公演");
    expect(result.error).toContain("同じクラス");
  });
});
