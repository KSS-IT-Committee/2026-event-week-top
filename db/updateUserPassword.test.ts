import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/db/schema";
import { updateUserPassword } from "@/db/updateUserPassword";
import { db } from "@/lib/db";

// A chainable update spy: update() -> set() -> where(), each returning `self`
// and where() resolving (the source awaits the chain). We capture the args.
type UpdateChain = {
  update: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
};

function makeUpdateChain(): UpdateChain {
  const where = vi.fn(async () => undefined);
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  return { update, set, where };
}

const { dbChain } = vi.hoisted(() => ({
  dbChain: {
    update: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
  } as UpdateChain,
}));

vi.mock("@/lib/db", () => ({ db: { update: vi.fn() } }));

beforeEach(() => {
  const fresh = makeUpdateChain();
  dbChain.update = fresh.update;
  dbChain.set = fresh.set;
  dbChain.where = fresh.where;
  // Route the mocked shared db through the per-test chain so we can assert on
  // db.update directly while still capturing .set/.where args.
  vi.mocked(db.update).mockImplementation(dbChain.update as never);
});

describe("updateUserPassword", () => {
  it("uses the shared db executor by default", async () => {
    await updateUserPassword("1A01", "hash1");

    expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.update)).toHaveBeenCalledWith(users);
  });

  it("passes { passwordHash } to .set", async () => {
    await updateUserPassword("1A01", "hash1");

    expect(dbChain.set).toHaveBeenCalledTimes(1);
    expect(dbChain.set).toHaveBeenCalledWith({ passwordHash: "hash1" });
  });

  it("filters by users.username via eq() in .where", async () => {
    await updateUserPassword("1A01", "hash1");

    expect(dbChain.where).toHaveBeenCalledTimes(1);
    expect(dbChain.where).toHaveBeenCalledWith(eq(users.username, "1A01"));
  });

  it("does not filter by the wrong column or value (eq matcher discriminates)", async () => {
    await updateUserPassword("1A01", "hash1");

    // Proves the eq() deep-equality match above is meaningful: a where()
    // built from another column or another value would not have matched.
    expect(dbChain.where).not.toHaveBeenCalledWith(
      eq(users.passwordHash, "1A01"),
    );
    expect(dbChain.where).not.toHaveBeenCalledWith(eq(users.username, "9Z99"));
  });

  it("chains set() on update()'s result and where() on set()'s result", async () => {
    await updateUserPassword("1A01", "hash1");

    // update() returns { set }, set() returns { where }: verify the source
    // walks the chain object-by-object rather than calling siblings directly.
    expect(dbChain.update).toHaveReturnedWith({ set: dbChain.set });
    expect(dbChain.set).toHaveReturnedWith({ where: dbChain.where });
  });

  it("calls update/set/where exactly once each (no extra writes)", async () => {
    await updateUserPassword("1A01", "hash1");

    expect(dbChain.update).toHaveBeenCalledTimes(1);
    expect(dbChain.set).toHaveBeenCalledTimes(1);
    expect(dbChain.where).toHaveBeenCalledTimes(1);
  });

  it("threads username and passwordHash through the chain", async () => {
    await updateUserPassword("2B02", "anotherHash");

    expect(dbChain.set).toHaveBeenCalledWith({ passwordHash: "anotherHash" });
    expect(dbChain.where).toHaveBeenCalledWith(eq(users.username, "2B02"));
  });

  it("uses a custom executor instead of db when one is passed", async () => {
    const custom = makeUpdateChain();
    const executor = { update: custom.update } as never;

    await updateUserPassword("3C03", "hashX", executor);

    expect(custom.update).toHaveBeenCalledTimes(1);
    expect(custom.update).toHaveBeenCalledWith(users);
    expect(custom.set).toHaveBeenCalledWith({ passwordHash: "hashX" });
    expect(custom.where).toHaveBeenCalledWith(eq(users.username, "3C03"));
    // The shared db must NOT be touched when a custom executor is supplied.
    expect(vi.mocked(db.update)).not.toHaveBeenCalled();
  });

  it("returns undefined (awaits the where result)", async () => {
    const result = await updateUserPassword("1A01", "hash1");
    expect(result).toBeUndefined();
  });
});
