import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteUserSessions } from "@/db/deleteUserSessions";
import { sessions } from "@/db/schema";
import { db } from "@/lib/db";

// `eq` is mocked so we can assert which column/value the WHERE clause uses
// without depending on drizzle's internal SQL representation. It returns a
// tagged sentinel that `where` receives verbatim.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq: vi.fn((col: unknown, val: unknown) => ({ __eq: true, col, val })),
  };
});

// `@/lib/db` exposes the default executor: db.delete(table).where(cond).
// Both links are spies so we can assert the chain and its arguments.
const { whereSpy, deleteSpy } = vi.hoisted(() => {
  const whereSpy = vi.fn(async () => undefined);
  const deleteSpy = vi.fn(() => ({ where: whereSpy }));
  return { whereSpy, deleteSpy };
});

vi.mock("@/lib/db", () => ({
  db: { delete: deleteSpy },
}));

function makeExecutor() {
  const where = vi.fn(async () => undefined);
  const del = vi.fn(() => ({ where }));
  return { executor: { delete: del }, del, where };
}

describe("deleteUserSessions", () => {
  beforeEach(() => {
    deleteSpy.mockReturnValue({ where: whereSpy });
  });

  it("uses the default db executor: db.delete(sessions).where(eq(username))", async () => {
    await deleteUserSessions("1A01");

    expect(deleteSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledWith(sessions);
    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(vi.mocked(eq)).toHaveBeenCalledWith(sessions.username, "1A01");
    expect(whereSpy).toHaveBeenCalledWith({
      __eq: true,
      col: sessions.username,
      val: "1A01",
    });
  });

  it("passes the exact username through to the eq condition", async () => {
    await deleteUserSessions("victim-name");

    expect(vi.mocked(eq)).toHaveBeenCalledWith(
      sessions.username,
      "victim-name",
    );
  });

  it("awaits the where() promise (resolves to undefined)", async () => {
    await expect(deleteUserSessions("1A01")).resolves.toBeUndefined();
  });

  it("propagates a rejection from the default executor's where()", async () => {
    const boom = new Error("delete failed");
    whereSpy.mockRejectedValueOnce(boom);

    await expect(deleteUserSessions("1A01")).rejects.toBe(boom);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it("passes an empty username straight through to eq", async () => {
    await deleteUserSessions("");

    expect(vi.mocked(eq)).toHaveBeenCalledWith(sessions.username, "");
    expect(whereSpy).toHaveBeenCalledWith({
      __eq: true,
      col: sessions.username,
      val: "",
    });
  });

  it("uses a custom executor (tx handle) and never touches db.delete", async () => {
    const { executor, del, where } = makeExecutor();

    await deleteUserSessions("1A01", executor as never);

    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith(sessions);
    expect(where).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledWith({
      __eq: true,
      col: sessions.username,
      val: "1A01",
    });
    // The default db executor must not be used when a custom one is supplied.
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("resolves undefined when a custom executor is supplied", async () => {
    const { executor } = makeExecutor();

    await expect(
      deleteUserSessions("1A01", executor as never),
    ).resolves.toBeUndefined();
  });

  it("propagates a rejection from a custom executor's where()", async () => {
    const { executor, where } = makeExecutor();
    const boom = new Error("tx delete failed");
    where.mockRejectedValueOnce(boom);

    await expect(deleteUserSessions("1A01", executor as never)).rejects.toBe(
      boom,
    );
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
