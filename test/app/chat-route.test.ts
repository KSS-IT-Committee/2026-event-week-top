import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/chat/route";
import { isClassName } from "@/db/schema";
import { type ChatMessage, runChat } from "@/lib/chat";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { classOf } from "@/lib/user-category";

// next/server is only imported for its NextRequest type here; the handler never
// constructs one, so a bare class stub suffices.
vi.mock("next/server", () => ({ NextRequest: class {} }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/chat", () => ({ runChat: vi.fn() }));
vi.mock("@/lib/user-category", () => ({ classOf: vi.fn() }));
vi.mock("@/db/schema", () => ({ isClassName: vi.fn() }));

const mockGetCurrentUser = vi.mocked(getCurrentUser);
const mockCheckRateLimit = vi.mocked(checkRateLimit);
const mockRunChat = vi.mocked(runChat);
const mockClassOf = vi.mocked(classOf);
const mockIsClassName = vi.mocked(isClassName);

const QUOTA_NOTE =
  "\n\n（ただいまアクセスが集中しています。少し時間をおいて再度お試しください。）";
const GENERIC_NOTE =
  "\n\n（エラーが発生しました。時間をおいて再度お試しください。）";

// Build a fake NextRequest-like object. `json` resolves to `body` unless
// `jsonError` is set, in which case it rejects (simulating an invalid body).
function makeRequest(options: {
  body?: unknown;
  jsonError?: boolean;
  signal?: AbortSignal;
}) {
  return {
    json: vi.fn(async () => {
      if (options.jsonError) {
        throw new SyntaxError("Unexpected token");
      }
      return options.body;
    }),
    signal: options.signal ?? new AbortController().signal,
    headers: { get: () => null },
  } as unknown as Parameters<typeof POST>[0];
}

// Turn an array of string deltas into an async generator, matching runChat's
// AsyncGenerator<string> contract.
function deltaGenerator(deltas: string[]) {
  return (async function* () {
    for (const d of deltas) {
      yield d;
    }
  })();
}

// A generator that yields some deltas then throws — to exercise the catch path.
function throwingGenerator(deltas: string[], error: unknown) {
  return (async function* () {
    for (const d of deltas) {
      yield d;
    }
    throw error;
  })();
}

// Read the streamed body of a Response into a single string.
async function readBody(res: Response): Promise<string> {
  return await res.text();
}

const userMessage: ChatMessage = { role: "user", text: "hello" };

beforeEach(() => {
  // clearMocks wipes implementations; re-apply the common happy-path defaults.
  mockGetCurrentUser.mockResolvedValue({ username: "1A01", roles: [] });
  mockCheckRateLimit.mockReturnValue({ ok: true, retryAfterSeconds: 0 });
  mockClassOf.mockReturnValue(null);
  mockIsClassName.mockReturnValue(false);
  mockRunChat.mockImplementation(() => deltaGenerator([]) as never);
});

describe("POST /api/chat — auth", () => {
  it("returns 401 and does not call runChat when there is no session", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
    expect(mockRunChat).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat — rate limiting", () => {
  it("returns 429 with retry-after when the per-user limit is exceeded", async () => {
    mockCheckRateLimit.mockReturnValueOnce({
      ok: false,
      retryAfterSeconds: 42,
    });

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "rate limited" });
    // Only the per-user check ran; the global check is short-circuited.
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(1);
    expect(mockCheckRateLimit).toHaveBeenCalledWith("1A01", 15, 60_000);
    expect(mockRunChat).not.toHaveBeenCalled();
  });

  it("returns 429 when the per-user check passes but the global ceiling is hit", async () => {
    mockCheckRateLimit
      .mockReturnValueOnce({ ok: true, retryAfterSeconds: 0 })
      .mockReturnValueOnce({ ok: false, retryAfterSeconds: 7 });

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("7");
    expect(mockCheckRateLimit).toHaveBeenCalledTimes(2);
    // The global check uses the dedicated key and the default ceiling of 600.
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      "__chat_global__",
      600,
      60_000,
    );
    expect(mockRunChat).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat — body parsing", () => {
  it("returns 400 when request.json() throws (invalid JSON)", async () => {
    const res = await POST(makeRequest({ jsonError: true }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body." });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockRunChat).not.toHaveBeenCalled();
  });

  async function expect400(body: unknown, error: string) {
    const res = await POST(makeRequest({ body }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(mockRunChat).not.toHaveBeenCalled();
  }

  it("400 when body is not an object (string)", async () => {
    await expect400("nope", "Body must be { messages: [...] }.");
  });

  it("400 when body is null", async () => {
    await expect400(null, "Body must be { messages: [...] }.");
  });

  it("400 when body lacks a messages key", async () => {
    await expect400({ foo: 1 }, "Body must be { messages: [...] }.");
  });

  it("400 when messages is not an array", async () => {
    await expect400({ messages: "x" }, "messages must be a non-empty array.");
  });

  it("400 when messages is an empty array", async () => {
    await expect400({ messages: [] }, "messages must be a non-empty array.");
  });

  it("400 when there are too many messages (> 30)", async () => {
    const many = Array.from({ length: 31 }, () => ({
      role: "user",
      text: "x",
    }));
    await expect400({ messages: many }, "Too many messages (max 30).");
  });

  it("400 when a message item is not an object", async () => {
    await expect400({ messages: ["x"] }, "Each message must be an object.");
  });

  it("400 when a message item is null", async () => {
    await expect400({ messages: [null] }, "Each message must be an object.");
  });

  it("400 when a role is neither user nor model", async () => {
    await expect400(
      { messages: [{ role: "system", text: "x" }] },
      'Each message role must be "user" or "model".',
    );
  });

  it("400 when text is not a string", async () => {
    await expect400(
      { messages: [{ role: "user", text: 5 }] },
      "Each message text must be a string.",
    );
  });

  it("400 when text is empty after trimming", async () => {
    await expect400(
      { messages: [{ role: "user", text: "   " }] },
      "Message text must not be empty.",
    );
  });

  it("400 when a single message is too long (> 4000 chars)", async () => {
    await expect400(
      { messages: [{ role: "user", text: "a".repeat(4001) }] },
      "A message is too long (max 4000).",
    );
  });

  it("400 when the conversation total is too long (> 20000 chars)", async () => {
    // Each message is within the per-message cap (4000) but their sum exceeds
    // the 20000 total. 6 user messages of 4000 chars = 24000 total.
    const big = Array.from({ length: 6 }, () => ({
      role: "user",
      text: "a".repeat(4000),
    }));
    await expect400({ messages: big }, "Conversation is too long (max 20000).");
  });

  it("400 when the last message is not from the user", async () => {
    await expect400(
      {
        messages: [
          { role: "user", text: "hi" },
          { role: "model", text: "answer" },
        ],
      },
      "The last message must be from the user.",
    );
  });

  it("accepts exactly 30 messages (boundary is inclusive)", async () => {
    const thirty = Array.from({ length: 30 }, () => ({
      role: "user",
      text: "x",
    }));

    const res = await POST(makeRequest({ body: { messages: thirty } }));

    expect(res.status).toBe(200);
    expect(mockRunChat).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/chat — happy path streaming", () => {
  it("streams runChat deltas with the right headers", async () => {
    mockRunChat.mockImplementation(
      () => deltaGenerator(["Hello", ", ", "world"]) as never,
    );

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(await readBody(res)).toBe("Hello, world");
  });

  it("forwards the parsed (trimmed) messages, viewer, and abort signal to runChat", async () => {
    const controller = new AbortController();
    mockRunChat.mockImplementation(() => deltaGenerator(["ok"]) as never);

    const res = await POST(
      makeRequest({
        body: { messages: [{ role: "user", text: "  spaced  " }] },
        signal: controller.signal,
      }),
    );
    await readBody(res);

    expect(mockRunChat).toHaveBeenCalledTimes(1);
    const [messages, viewer, signal] = mockRunChat.mock.calls[0];
    expect(messages).toEqual([{ role: "user", text: "spaced" }]);
    expect(viewer).toEqual({ className: null });
    expect(signal).toBe(controller.signal);
  });

  it("returns 200 with an empty body when runChat yields no deltas", async () => {
    mockRunChat.mockImplementation(() => deltaGenerator([]) as never);

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    // No error thrown, so no note is appended — the body is exactly empty.
    expect(await readBody(res)).toBe("");
    expect(mockRunChat).toHaveBeenCalledTimes(1);
  });

  it("reads the stream via getReader() and reconstructs the deltas", async () => {
    mockRunChat.mockImplementation(
      () => deltaGenerator(["a", "b", "c"]) as never,
    );

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let out = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    out += decoder.decode();
    expect(out).toBe("abc");
  });
});

describe("POST /api/chat — viewer class derivation", () => {
  it("sets className for a student when classOf returns a valid ClassName", async () => {
    mockClassOf.mockReturnValue("1A");
    mockIsClassName.mockReturnValue(true);
    mockRunChat.mockImplementation(() => deltaGenerator(["x"]) as never);

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));
    await readBody(res);

    expect(mockClassOf).toHaveBeenCalledWith("1A01");
    expect(mockIsClassName).toHaveBeenCalledWith("1A");
    const [, viewer] = mockRunChat.mock.calls[0];
    expect(viewer).toEqual({ className: "1A" });
  });

  it("sets className null for a non-student (classOf returns null)", async () => {
    mockClassOf.mockReturnValue(null);
    mockRunChat.mockImplementation(() => deltaGenerator(["x"]) as never);

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));
    await readBody(res);

    // classOf returned null, so isClassName must be short-circuited away.
    expect(mockIsClassName).not.toHaveBeenCalled();
    const [, viewer] = mockRunChat.mock.calls[0];
    expect(viewer).toEqual({ className: null });
  });

  it("sets className null when classOf is non-null but isClassName rejects it", async () => {
    mockClassOf.mockReturnValue("ZZ");
    mockIsClassName.mockReturnValue(false);
    mockRunChat.mockImplementation(() => deltaGenerator(["x"]) as never);

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));
    await readBody(res);

    expect(mockIsClassName).toHaveBeenCalledWith("ZZ");
    const [, viewer] = mockRunChat.mock.calls[0];
    expect(viewer).toEqual({ className: null });
  });
});

describe("POST /api/chat — generation errors", () => {
  // Every test here drives runChat to throw, which the handler logs via
  // console.error in its stream catch block. Silence that expected logging so a
  // green run stays quiet (and let one test assert the logging contract).
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("appends the congestion note when runChat throws a quota error (status 429)", async () => {
    mockRunChat.mockImplementation(
      () => throwingGenerator(["partial"], { status: 429 }) as never,
    );

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(res.status).toBe(200);
    expect(await readBody(res)).toBe("partial" + QUOTA_NOTE);
  });

  it("treats a RESOURCE_EXHAUSTED message as a quota error", async () => {
    mockRunChat.mockImplementation(
      () =>
        throwingGenerator(
          [],
          new Error("RESOURCE_EXHAUSTED: out of tokens"),
        ) as never,
    );

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(await readBody(res)).toBe(QUOTA_NOTE);
  });

  it("treats a message containing 'quota' as a quota error", async () => {
    mockRunChat.mockImplementation(
      () => throwingGenerator([], new Error("daily quota reached")) as never,
    );

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(await readBody(res)).toBe(QUOTA_NOTE);
  });

  it("treats a message containing a standalone 429 token as a quota error", async () => {
    // Hits the message regex branch (\b429\b) rather than the numeric
    // status === 429 branch — the error object has no `status` field.
    mockRunChat.mockImplementation(
      () =>
        throwingGenerator(
          ["x"],
          new Error("upstream returned 429 too many requests"),
        ) as never,
    );

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(await readBody(res)).toBe("x" + QUOTA_NOTE);
  });

  it("does not treat a 4290 status-like substring as a quota error (word boundary)", async () => {
    // 4290 has no \b429\b match and status is not the number 429, so this must
    // fall through to the generic note — proving the regex is anchored, not a
    // loose substring test.
    mockRunChat.mockImplementation(
      () =>
        throwingGenerator([], { status: 4290, message: "got 4290" }) as never,
    );

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(await readBody(res)).toBe(GENERIC_NOTE);
  });

  it("treats a non-object thrown value (string) as a non-quota error", async () => {
    // isQuotaError's first guard returns false for non-objects, so a thrown
    // string yields the generic note.
    mockRunChat.mockImplementation(
      () => throwingGenerator(["partial"], "string failure") as never,
    );

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(await readBody(res)).toBe("partial" + GENERIC_NOTE);
  });

  it("treats a thrown null as a non-quota error", async () => {
    mockRunChat.mockImplementation(() => throwingGenerator([], null) as never);

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(await readBody(res)).toBe(GENERIC_NOTE);
  });

  it("appends the generic note for a non-quota error", async () => {
    mockRunChat.mockImplementation(
      () => throwingGenerator(["start"], new Error("boom")) as never,
    );

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));

    expect(await readBody(res)).toBe("start" + GENERIC_NOTE);
    expect(errorSpy).toHaveBeenCalledWith(
      "[chat] generation error",
      expect.any(Error),
    );
  });
});

describe("POST /api/chat — global rate-limit env override", () => {
  it("uses CHAT_GLOBAL_RATE_LIMIT when it is a positive integer", async () => {
    vi.stubEnv("CHAT_GLOBAL_RATE_LIMIT", "1234");
    mockRunChat.mockImplementation(() => deltaGenerator(["x"]) as never);

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));
    await readBody(res);

    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      "__chat_global__",
      1234,
      60_000,
    );
  });

  it("falls back to the default 600 when CHAT_GLOBAL_RATE_LIMIT is not a positive integer", async () => {
    vi.stubEnv("CHAT_GLOBAL_RATE_LIMIT", "0");
    mockRunChat.mockImplementation(() => deltaGenerator(["x"]) as never);

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));
    await readBody(res);

    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      "__chat_global__",
      600,
      60_000,
    );
  });

  it("falls back to the default 600 when CHAT_GLOBAL_RATE_LIMIT is non-numeric", async () => {
    vi.stubEnv("CHAT_GLOBAL_RATE_LIMIT", "abc");
    mockRunChat.mockImplementation(() => deltaGenerator(["x"]) as never);

    const res = await POST(makeRequest({ body: { messages: [userMessage] } }));
    await readBody(res);

    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      "__chat_global__",
      600,
      60_000,
    );
  });
});
