import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/session/route";
import { validateSessionTokenViaDb } from "@/lib/session";

vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/session", () => ({ validateSessionTokenViaDb: vi.fn() }));

function req(headers: Record<string, string>) {
  return {
    headers: {
      get: (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null,
    },
  } as unknown as Parameters<typeof GET>[0];
}

const mockValidate = vi.mocked(validateSessionTokenViaDb);

describe("GET /api/session", () => {
  beforeEach(() => {
    mockValidate.mockReset();
  });

  it("returns 401 unauthorized when PREVIEW_AUTH_SECRET is unset", async () => {
    vi.stubEnv("PREVIEW_AUTH_SECRET", undefined as unknown as string);
    expect(process.env.PREVIEW_AUTH_SECRET).toBeUndefined();

    const res = await GET(
      req({ "x-preview-auth-secret": "s3cret", "x-session-token": "tok" }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it("returns 401 unauthorized when x-preview-auth-secret header is absent", async () => {
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");

    const res = await GET(req({ "x-session-token": "tok" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it("returns 401 when the provided secret is wrong but the same length", async () => {
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");

    const res = await GET(req({ "x-preview-auth-secret": "s3creT" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it("returns 401 when the provided secret is wrong with a different length", async () => {
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");

    const res = await GET(req({ "x-preview-auth-secret": "nope" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it("returns 400 missing token when authorized but no x-session-token header", async () => {
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");

    const res = await GET(req({ "x-preview-auth-secret": "s3cret" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing token" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it("returns 400 missing token when authorized but x-session-token is empty", async () => {
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");

    const res = await GET(
      req({ "x-preview-auth-secret": "s3cret", "x-session-token": "" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing token" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it("returns 401 invalid session when the token resolves to null", async () => {
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    mockValidate.mockResolvedValue(null);

    const res = await GET(
      req({ "x-preview-auth-secret": "s3cret", "x-session-token": "tok" }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid session" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockValidate).toHaveBeenCalledWith("tok");
  });

  it("returns 200 with username and roles when the token is valid", async () => {
    vi.stubEnv("PREVIEW_AUTH_SECRET", "s3cret");
    mockValidate.mockResolvedValue({ username: "1A01", roles: ["IT"] });

    const res = await GET(
      req({ "x-preview-auth-secret": "s3cret", "x-session-token": "tok" }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ username: "1A01", roles: ["IT"] });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockValidate).toHaveBeenCalledWith("tok");
  });
});
