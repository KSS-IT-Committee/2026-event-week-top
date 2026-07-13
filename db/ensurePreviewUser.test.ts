import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensurePreviewUser } from "@/db/ensurePreviewUser";
import { users } from "@/db/schema";
import { db } from "@/lib/db";

const { onConflictSpy, valuesSpy, insertSpy } = vi.hoisted(() => {
  const onConflictSpy = vi.fn(async () => undefined);
  const valuesSpy = vi.fn(() => ({ onConflictDoNothing: onConflictSpy }));
  const insertSpy = vi.fn(() => ({ values: valuesSpy }));
  return { onConflictSpy, valuesSpy, insertSpy };
});

vi.mock("@/lib/db", () => ({
  db: { insert: insertSpy },
}));

function makeExecutor() {
  const onConflictDoNothing = vi.fn(async () => undefined);
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  return { executor: { insert }, insert, values, onConflictDoNothing };
}

describe("ensurePreviewUser", () => {
  beforeEach(() => {
    insertSpy.mockReturnValue({ values: valuesSpy });
    valuesSpy.mockReturnValue({ onConflictDoNothing: onConflictSpy });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a no-op outside PR previews (IS_PR_PREVIEW unset)", async () => {
    await expect(ensurePreviewUser("3A05")).resolves.toBeUndefined();

    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("is a no-op when IS_PR_PREVIEW is set but not 'true'", async () => {
    vi.stubEnv("IS_PR_PREVIEW", "false");

    await ensurePreviewUser("3A05");

    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("upserts a stub users row on a preview, tolerating an existing row", async () => {
    vi.stubEnv("IS_PR_PREVIEW", "true");

    await ensurePreviewUser("3A05");

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy).toHaveBeenCalledWith(users);
    expect(valuesSpy).toHaveBeenCalledWith({
      username: "3A05",
      // Valid bcrypt shape (compare fails cleanly, never throws), but of a
      // discarded random secret — the stub can never be logged in with.
      passwordHash: expect.stringMatching(/^\$2[aby]\$12\$.{53}$/),
    });
    expect(onConflictSpy).toHaveBeenCalledTimes(1);
  });

  it("uses a custom executor (tx handle) and never touches db.insert", async () => {
    vi.stubEnv("IS_PR_PREVIEW", "true");
    const { executor, insert, onConflictDoNothing } = makeExecutor();

    await ensurePreviewUser("3A05", executor as never);

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(users);
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });
});
