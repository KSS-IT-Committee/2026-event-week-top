import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/db/schema";
import { setUserLoggedIn } from "@/db/setUserLoggedIn";

// Each stage returns a DISTINCT next-stage object so the test proves the
// builder is actually chained (set is invoked on update's return, where on
// set's return) rather than three independent spies that happen to fire.
// `order` records call sequence to assert update -> set -> where.
const { spies, order } = vi.hoisted(() => ({
  spies: {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
  },
  order: [] as string[],
}));

vi.mock("@/lib/db", () => {
  const whereStage = {
    where: (...args: unknown[]) => {
      order.push("where");
      spies.where(...args);
      return Promise.resolve(undefined);
    },
  };
  const setStage = {
    set: (...args: unknown[]) => {
      order.push("set");
      spies.set(...args);
      return whereStage;
    },
  };
  return {
    db: {
      update: (...args: unknown[]) => {
        order.push("update");
        spies.update(...args);
        return setStage;
      },
    },
  };
});

describe("setUserLoggedIn", () => {
  beforeEach(() => {
    spies.update.mockClear();
    spies.set.mockClear();
    spies.where.mockClear();
    order.length = 0;
  });

  it("updates the users table", async () => {
    await setUserLoggedIn("3B-01");
    expect(spies.update).toHaveBeenCalledTimes(1);
    expect(spies.update).toHaveBeenCalledWith(users);
  });

  it("sets only { hasLoggedIn: true } (monotonic)", async () => {
    await setUserLoggedIn("3B-01");
    expect(spies.set).toHaveBeenCalledTimes(1);
    expect(spies.set).toHaveBeenCalledWith({ hasLoggedIn: true });
  });

  it("filters by eq(users.username, username)", async () => {
    await setUserLoggedIn("3B-01");
    expect(spies.where).toHaveBeenCalledTimes(1);
    expect(spies.where).toHaveBeenCalledWith(eq(users.username, "3B-01"));
  });

  it("passes the given username through to the where clause", async () => {
    await setUserLoggedIn("4C-99");
    expect(spies.where).toHaveBeenCalledWith(eq(users.username, "4C-99"));
  });

  it("invokes the builder in order: update -> set -> where", async () => {
    await setUserLoggedIn("3B-01");
    expect(order).toEqual(["update", "set", "where"]);
  });

  it("never sets hasLoggedIn to false (monotonic latch)", async () => {
    await setUserLoggedIn("3B-01");
    const arg = spies.set.mock.calls[0][0] as { hasLoggedIn: boolean };
    expect(arg.hasLoggedIn).toBe(true);
    expect(arg.hasLoggedIn).not.toBe(false);
    expect(Object.keys(arg)).toEqual(["hasLoggedIn"]);
  });

  it("stays idempotent across repeated calls (always sets true)", async () => {
    await setUserLoggedIn("3B-01");
    await setUserLoggedIn("3B-01");
    expect(spies.set).toHaveBeenCalledTimes(2);
    expect(spies.set).toHaveBeenNthCalledWith(1, { hasLoggedIn: true });
    expect(spies.set).toHaveBeenNthCalledWith(2, { hasLoggedIn: true });
  });

  it("awaits the chain cleanly (resolves to undefined)", async () => {
    await expect(setUserLoggedIn("3B-01")).resolves.toBeUndefined();
  });
});
