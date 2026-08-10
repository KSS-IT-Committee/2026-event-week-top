import { beforeEach, describe, expect, it, vi } from "vitest";

import { getNews, type NewsItem } from "@/app/news/newsData";
import { getAnnouncements } from "@/db/getAnnouncements";
import { getDeductions } from "@/db/getDeductions";
import { getEquipmentAvailability } from "@/db/getEquipmentAvailability";
import { chatToolDeclarations, dispatchTool } from "@/lib/chat-tools";

vi.mock("@/db/getAnnouncements", () => ({ getAnnouncements: vi.fn() }));
vi.mock("@/db/getDeductions", () => ({ getDeductions: vi.fn() }));
vi.mock("@/db/getEquipmentAvailability", () => ({
  getEquipmentAvailability: vi.fn(),
}));
vi.mock("@/app/news/newsData", () => ({ getNews: vi.fn() }));

function makeNewsItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    id: "id",
    title: "title",
    date: "2026-06-23",
    tag: "tag",
    content: "content",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(getAnnouncements).mockResolvedValue([]);
  vi.mocked(getDeductions).mockResolvedValue([]);
  vi.mocked(getEquipmentAvailability).mockResolvedValue([]);
  vi.mocked(getNews).mockReturnValue([]);
});

describe("dispatchTool — get_announcements", () => {
  it("returns empty list with a note and does NOT call getAnnouncements when className is null", async () => {
    const result = await dispatchTool(
      "get_announcements",
      {},
      { className: null, roles: [] },
    );

    expect(result).toEqual({
      announcements: [],
      note: "Announcements are scoped to a student's class; this account has no class.",
    });
    expect(typeof result.note).toBe("string");
    expect(getAnnouncements).not.toHaveBeenCalled();
  });

  it("calls getAnnouncements with the viewer's class and returns the result", async () => {
    const mockAnnouncements = [{ id: 1 }] as unknown as Awaited<
      ReturnType<typeof getAnnouncements>
    >;
    vi.mocked(getAnnouncements).mockResolvedValue(mockAnnouncements);

    const result = await dispatchTool(
      "get_announcements",
      {},
      { className: "3B", roles: [] },
    );

    expect(getAnnouncements).toHaveBeenCalledTimes(1);
    expect(getAnnouncements).toHaveBeenCalledWith("3B");
    expect(result).toEqual({ announcements: mockAnnouncements });
  });
});

describe("dispatchTool — get_equipment_availability", () => {
  it("trims a padded name before passing it to getEquipmentAvailability", async () => {
    const mockEquipment = [{ id: 1 }] as unknown as Awaited<
      ReturnType<typeof getEquipmentAvailability>
    >;
    vi.mocked(getEquipmentAvailability).mockResolvedValue(mockEquipment);

    const result = await dispatchTool(
      "get_equipment_availability",
      { name: "  cone  " },
      { className: null, roles: [] },
    );

    expect(getEquipmentAvailability).toHaveBeenCalledWith("cone");
    expect(result).toEqual({ equipment: mockEquipment });
  });

  it("passes undefined when name is only whitespace", async () => {
    await dispatchTool(
      "get_equipment_availability",
      { name: "   " },
      { className: null, roles: [] },
    );

    expect(getEquipmentAvailability).toHaveBeenCalledWith(undefined);
  });

  it("passes undefined when name is absent", async () => {
    await dispatchTool(
      "get_equipment_availability",
      {},
      { className: null, roles: [] },
    );

    expect(getEquipmentAvailability).toHaveBeenCalledWith(undefined);
  });

  it("passes the trimmed value through when name is present", async () => {
    await dispatchTool(
      "get_equipment_availability",
      { name: "x" },
      { className: null, roles: [] },
    );

    expect(getEquipmentAvailability).toHaveBeenCalledWith("x");
  });

  it("passes undefined when name is a non-string value", async () => {
    await dispatchTool(
      "get_equipment_availability",
      { name: 123 as unknown as string },
      { className: null, roles: [] },
    );

    expect(getEquipmentAvailability).toHaveBeenCalledWith(undefined);
  });
});

describe("dispatchTool — get_deductions", () => {
  it("returns empty list with a note and does NOT call getDeductions when className is null", async () => {
    const result = await dispatchTool(
      "get_deductions",
      {},
      { className: null, roles: [] },
    );

    expect(result).toEqual({
      deductions: [],
      note: "Deductions are only available to student accounts, scoped to their own class.",
    });
    expect(typeof result.note).toBe("string");
    expect(getDeductions).not.toHaveBeenCalled();
  });

  it("calls getDeductions with the viewer's class and returns the result", async () => {
    const mockDeductions = [{ id: 1 }] as unknown as Awaited<
      ReturnType<typeof getDeductions>
    >;
    vi.mocked(getDeductions).mockResolvedValue(mockDeductions);

    const result = await dispatchTool(
      "get_deductions",
      {},
      { className: "3B", roles: [] },
    );

    expect(getDeductions).toHaveBeenCalledTimes(1);
    expect(getDeductions).toHaveBeenCalledWith("3B");
    expect(result).toEqual({ deductions: mockDeductions });
  });
});

describe("dispatchTool — get_recent_news limit clamping", () => {
  beforeEach(() => {
    const items = Array.from({ length: 25 }, (_, i) =>
      makeNewsItem({ id: String(i), title: `news ${i}` }),
    );
    vi.mocked(getNews).mockReturnValue(items);
  });

  async function newsCount(args: Record<string, unknown>): Promise<number> {
    const result = await dispatchTool("get_recent_news", args, {
      className: null,
      roles: [],
    });
    return (result.news as unknown[]).length;
  }

  it("defaults to 5 items when no limit is given", async () => {
    expect(await newsCount({})).toBe(5);
  });

  it("returns the requested number of items", async () => {
    expect(await newsCount({ limit: 3 })).toBe(3);
  });

  it("clamps a limit of 0 up to 1", async () => {
    expect(await newsCount({ limit: 0 })).toBe(1);
  });

  it("clamps a negative limit up to 1", async () => {
    expect(await newsCount({ limit: -5 })).toBe(1);
  });

  it("allows the maximum of 20", async () => {
    expect(await newsCount({ limit: 25 })).toBe(20);
  });

  it("clamps a limit above 20 down to 20", async () => {
    expect(await newsCount({ limit: 100 })).toBe(20);
  });

  it("truncates a fractional limit", async () => {
    expect(await newsCount({ limit: 3.9 })).toBe(3);
  });

  it("falls back to default 5 for Infinity (not finite)", async () => {
    expect(await newsCount({ limit: Infinity })).toBe(5);
  });

  it("falls back to default 5 for a string limit", async () => {
    expect(await newsCount({ limit: "3" })).toBe(5);
  });

  it("falls back to default 5 for NaN", async () => {
    expect(await newsCount({ limit: NaN })).toBe(5);
  });
});

describe("dispatchTool — get_recent_news content trimming", () => {
  it("truncates content longer than 800 chars and appends an ellipsis", async () => {
    const longContent = "a".repeat(801);
    vi.mocked(getNews).mockReturnValue([
      makeNewsItem({ content: longContent }),
    ]);

    const result = await dispatchTool(
      "get_recent_news",
      { limit: 1 },
      {
        className: null,
        roles: [],
      },
    );
    const item = (result.news as Array<{ content: string }>)[0];

    expect(item.content).toBe(`${"a".repeat(800)}…`);
    expect(item.content.length).toBe(801);
  });

  it("passes short content through unchanged", async () => {
    const shortContent = "short body";
    vi.mocked(getNews).mockReturnValue([
      makeNewsItem({ content: shortContent }),
    ]);

    const result = await dispatchTool(
      "get_recent_news",
      { limit: 1 },
      {
        className: null,
        roles: [],
      },
    );
    const item = (result.news as Array<{ content: string }>)[0];

    expect(item.content).toBe(shortContent);
  });

  it("does not truncate content of exactly 800 chars", async () => {
    const exact = "b".repeat(800);
    vi.mocked(getNews).mockReturnValue([makeNewsItem({ content: exact })]);

    const result = await dispatchTool(
      "get_recent_news",
      { limit: 1 },
      {
        className: null,
        roles: [],
      },
    );
    const item = (result.news as Array<{ content: string }>)[0];

    expect(item.content).toBe(exact);
  });

  it("emits only title, date, tag and content keys per item", async () => {
    vi.mocked(getNews).mockReturnValue([
      makeNewsItem({
        id: "secret",
        title: "T",
        date: "2026-01-01",
        tag: "G",
        content: "C",
      }),
    ]);

    const result = await dispatchTool(
      "get_recent_news",
      { limit: 1 },
      {
        className: null,
        roles: [],
      },
    );
    const item = (result.news as Array<Record<string, unknown>>)[0];

    expect(Object.keys(item).sort()).toEqual(
      ["content", "date", "tag", "title"].sort(),
    );
    expect(item).toEqual({
      title: "T",
      date: "2026-01-01",
      tag: "G",
      content: "C",
    });
  });
});

describe("dispatchTool — get_recent_news viewer scoping", () => {
  it("passes the session viewer to getNews so restricted posts are filtered", async () => {
    const viewer = { className: null, roles: ["IT"] };

    await dispatchTool("get_recent_news", {}, viewer);

    expect(getNews).toHaveBeenCalledTimes(1);
    expect(getNews).toHaveBeenCalledWith(viewer);
  });
});

describe("dispatchTool — unknown tool", () => {
  it("returns a benign error object without calling any data source", async () => {
    const result = await dispatchTool(
      "nope",
      {},
      { className: "3B", roles: [] },
    );

    expect(result).toEqual({ error: "Unknown tool: nope" });
    expect(getAnnouncements).not.toHaveBeenCalled();
    expect(getDeductions).not.toHaveBeenCalled();
    expect(getEquipmentAvailability).not.toHaveBeenCalled();
    expect(getNews).not.toHaveBeenCalled();
  });
});

describe("chatToolDeclarations", () => {
  it("declares exactly four tools with the expected names in order", () => {
    expect(chatToolDeclarations).toHaveLength(4);
    expect(chatToolDeclarations.map((decl) => decl.name)).toEqual([
      "get_announcements",
      "get_equipment_availability",
      "get_deductions",
      "get_recent_news",
    ]);
  });

  it("gives every declaration a string description and an object parameters", () => {
    for (const decl of chatToolDeclarations) {
      expect(typeof decl.description).toBe("string");
      expect(decl.description!.length).toBeGreaterThan(0);
      expect(typeof decl.parameters).toBe("object");
      expect(decl.parameters).not.toBeNull();
    }
  });
});
