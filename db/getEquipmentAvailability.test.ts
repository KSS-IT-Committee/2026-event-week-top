import { connection } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getEquipmentAvailability } from "@/db/getEquipmentAvailability";

const { rowsHolder } = vi.hoisted(() => ({
  rowsHolder: { rows: [] as unknown[] },
}));

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

vi.mock("@/lib/db", () => {
  function chain() {
    const p = Promise.resolve(rowsHolder.rows);
    const proxy: unknown = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === "then") return p.then.bind(p);
        if (prop === "catch") return p.catch.bind(p);
        if (prop === "finally") return p.finally.bind(p);
        return () => proxy;
      },
      apply: () => proxy,
    });
    return proxy;
  }
  return { db: { select: () => chain() } };
});

describe("getEquipmentAvailability", () => {
  beforeEach(() => {
    rowsHolder.rows = [];
  });

  it("awaits connection() before querying", async () => {
    rowsHolder.rows = [];
    await getEquipmentAvailability();
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
  });

  it("appends available = quantity - borrowed", async () => {
    rowsHolder.rows = [{ id: 1, name: "Cone", quantity: 10, borrowed: 3 }];
    const result = await getEquipmentAvailability();
    expect(result).toEqual([
      { id: 1, name: "Cone", quantity: 10, borrowed: 3, available: 7 },
    ]);
  });

  it("returns available === quantity when borrowed is 0", async () => {
    rowsHolder.rows = [{ id: 2, name: "Net", quantity: 5, borrowed: 0 }];
    const result = await getEquipmentAvailability();
    expect(result[0].available).toBe(5);
    expect(result[0].available).toBe(result[0].quantity);
  });

  it("returns available 0 when borrowed === quantity", async () => {
    rowsHolder.rows = [{ id: 3, name: "Ball", quantity: 4, borrowed: 4 }];
    const result = await getEquipmentAvailability();
    expect(result[0].available).toBe(0);
  });

  it("returns [] for empty rows", async () => {
    rowsHolder.rows = [];
    const result = await getEquipmentAvailability();
    expect(result).toEqual([]);
  });

  it("computes availability for multiple rows", async () => {
    rowsHolder.rows = [
      { id: 1, name: "Cone", quantity: 10, borrowed: 3 },
      { id: 2, name: "Net", quantity: 2, borrowed: 0 },
      { id: 3, name: "Ball", quantity: 6, borrowed: 6 },
    ];
    const result = await getEquipmentAvailability();
    expect(result.map((r) => r.available)).toEqual([7, 2, 0]);
  });

  it("works with a name filter and custom limit arguments", async () => {
    rowsHolder.rows = [{ id: 1, name: "Cone", quantity: 10, borrowed: 1 }];
    const result = await getEquipmentAvailability("Cone", 5);
    expect(result).toEqual([
      { id: 1, name: "Cone", quantity: 10, borrowed: 1, available: 9 },
    ]);
    expect(vi.mocked(connection)).toHaveBeenCalledTimes(1);
  });
});
