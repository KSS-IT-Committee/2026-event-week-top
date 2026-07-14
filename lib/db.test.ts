import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared spies/holders, referenced by the hoisted vi.mock factories below and
// reused across vi.resetModules() so we can assert how lib/db drives them.
const { postgresMock, drizzleMock, fakeClient, fakeDb, schemaModule } =
  vi.hoisted(() => {
    const fakeClient = { kind: "pg-client" } as Record<string, unknown>;
    const fakeDb = {
      marker: "drizzle-db",
      select(this: unknown) {
        // Returns the receiver so we can detect whether the method was bound to
        // the underlying db (target) rather than the Proxy.
        return this;
      },
    } as Record<string, unknown>;
    const schemaModule = { users: { name: "users" }, announcements: {} };
    return {
      fakeClient,
      fakeDb,
      schemaModule,
      postgresMock: vi.fn(() => fakeClient),
      drizzleMock: vi.fn(() => fakeDb),
    };
  });

vi.mock("postgres", () => ({ default: postgresMock }));

vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: drizzleMock }));

vi.mock("@/db/schema", () => schemaModule);

function unsetEnv(name: string): void {
  vi.stubEnv(name, undefined as unknown as string);
}

async function importDb() {
  vi.resetModules();
  return import("@/lib/db");
}

describe("lib/db", () => {
  beforeEach(() => {
    delete (globalThis as { pgClient?: unknown }).pgClient;
    postgresMock.mockReturnValue(fakeClient);
    drizzleMock.mockReturnValue(fakeDb);
  });

  afterEach(() => {
    delete (globalThis as { pgClient?: unknown }).pgClient;
  });

  it("throws 'DATABASE_URL is not set' on property access when env unset", async () => {
    unsetEnv("DATABASE_URL");
    const { db } = await importDb();
    expect(() => db.select).toThrow("DATABASE_URL is not set");
    expect(postgresMock).not.toHaveBeenCalled();
    expect(drizzleMock).not.toHaveBeenCalled();
  });

  it("does not construct anything until a property is accessed", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    await importDb();
    expect(postgresMock).not.toHaveBeenCalled();
    expect(drizzleMock).not.toHaveBeenCalled();
  });

  it("first access builds the client with postgres(url, {max: 10}) and drizzle(client, {schema})", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:pw@host:5432/appdata");
    vi.stubEnv("NODE_ENV", "production");
    const { db } = await importDb();

    // Trigger lazy construction.
    void db.select;

    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith(
      "postgres://user:pw@host:5432/appdata",
      { max: 10 },
    );
    expect(drizzleMock).toHaveBeenCalledTimes(1);
    const [clientArg, optsArg] = drizzleMock.mock.calls[0] as unknown as [
      unknown,
      unknown,
    ];
    expect(clientArg).toBe(fakeClient);
    // The real `import * as schema` namespace is threaded through verbatim, not
    // just "some object" — assert the exact mocked schema shape is forwarded.
    expect(optsArg).toEqual({ schema: schemaModule });
  });

  it("memoizes _db: repeated access does not rebuild the client", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("NODE_ENV", "production");
    const { db } = await importDb();

    void db.select;
    void db.select;
    void (db as unknown as Record<string, unknown>).marker;

    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(drizzleMock).toHaveBeenCalledTimes(1);
  });

  it("caches the pool on globalThis.pgClient in non-production", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("NODE_ENV", "development");
    const { db } = await importDb();

    expect((globalThis as { pgClient?: unknown }).pgClient).toBeUndefined();
    void db.select;
    expect((globalThis as { pgClient?: unknown }).pgClient).toBe(fakeClient);
  });

  it("reuses an existing globalThis.pgClient instead of calling postgres()", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("NODE_ENV", "development");
    const existing = { kind: "preexisting-client" };
    (globalThis as { pgClient?: unknown }).pgClient = existing;
    const { db } = await importDb();

    void db.select;

    expect(postgresMock).not.toHaveBeenCalled();
    expect(drizzleMock).toHaveBeenCalledTimes(1);
    expect((drizzleMock.mock.calls[0] as unknown as unknown[])[0]).toBe(
      existing,
    );
    // The reused client stays in place.
    expect((globalThis as { pgClient?: unknown }).pgClient).toBe(existing);
  });

  it("does NOT stash the pool on globalThis.pgClient in production", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("NODE_ENV", "production");
    const { db } = await importDb();

    void db.select;

    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect((globalThis as { pgClient?: unknown }).pgClient).toBeUndefined();
  });

  it("returns function-valued properties bound to the underlying db (no 'this' error)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("NODE_ENV", "production");
    const { db } = await importDb();

    const select = db.select as () => unknown;
    expect(typeof select).toBe("function");
    // If it were unbound, `this` would be undefined; bound, it returns fakeDb.
    expect(select()).toBe(fakeDb);
  });

  it("returns non-function properties directly (not bound/wrapped)", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("NODE_ENV", "production");
    const { db } = await importDb();

    expect((db as unknown as Record<string, unknown>).marker).toBe(
      "drizzle-db",
    );
  });

  it("a fresh module instance reuses the pool the first one stashed (HMR)", async () => {
    // This exercises the real round-trip the globalThis cache exists for:
    // module instance #1 populates global.pgClient, and a second instance
    // (simulated by resetModules + re-import) must reuse it instead of opening
    // a new pool. Non-production keeps the stash enabled.
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("NODE_ENV", "development");

    const first = await importDb();
    void first.db.select;
    expect(postgresMock).toHaveBeenCalledTimes(1);

    // Re-import a new module instance; the global pool survives resetModules.
    const second = await importDb();
    void second.db.select;

    // No second pool was opened; drizzle was re-built against the same client.
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(drizzleMock).toHaveBeenCalledTimes(2);
    expect((drizzleMock.mock.calls[1] as unknown as unknown[])[0]).toBe(
      fakeClient,
    );
  });

  it("does not memoize on a failed (env-unset) access; later access succeeds", async () => {
    // The throw happens before `_db` is assigned, so a missing URL must not
    // poison the module — once DATABASE_URL is present a later access builds.
    unsetEnv("DATABASE_URL");
    const { db } = await importDb();

    expect(() => db.select).toThrow("DATABASE_URL is not set");
    expect(postgresMock).not.toHaveBeenCalled();

    vi.stubEnv("DATABASE_URL", "postgres://now-set");
    vi.stubEnv("NODE_ENV", "production");

    expect((db as unknown as Record<string, unknown>).marker).toBe(
      "drizzle-db",
    );
    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock).toHaveBeenCalledWith("postgres://now-set", {
      max: 10,
    });
  });
});
