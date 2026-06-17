import type { NextRequest } from "next/server";

import { isClassName } from "@/db/schema";
import { type ChatMessage, runChat } from "@/lib/chat";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { classOf } from "@/lib/user-category";

/**
 * Streaming chat endpoint for the /chat assistant.
 *
 * Auth is enforced here independently of the page's <AuthGuard>: the guard only
 * protects the rendered page, so this handler re-checks the shared session and
 * rejects anonymous callers. Each user message is a metered Gemini call, so we
 * also cap input size and rate-limit per user.
 *
 * Runs on the Node runtime (postgres-js + @google/genai need it) and is always
 * dynamic (it reads the session cookie). The response is a plain-text stream of
 * answer deltas.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Input caps — the real cost guard. Reject oversized conversations before
// spending a token.
const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 20000;

// Per-user rate limit (see lib/rate-limit.ts — per-instance, a guardrail).
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

// Per-instance global ceiling across ALL users, on top of the per-user limit.
// The ~1000 printed credentials mean the per-user cap alone permits a large
// aggregate, and each accepted request can fan out to several Gemini calls, so
// cap total accepted requests per instance to bound worst-case cost. Still
// per-process — a true global cap needs shared state (see lib/rate-limit.ts).
// Tunable via CHAT_GLOBAL_RATE_LIMIT for high-traffic events.
const GLOBAL_RATE_KEY = "__chat_global__";
const DEFAULT_GLOBAL_RATE_LIMIT = 600;

function globalRateLimit(): number {
  const raw = Number.parseInt(process.env.CHAT_GLOBAL_RATE_LIMIT ?? "", 10);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_GLOBAL_RATE_LIMIT;
}

const NO_STORE = { "cache-control": "no-store" } as const;

function rateLimitedResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "rate limited" },
    {
      status: 429,
      headers: { ...NO_STORE, "retry-after": String(retryAfterSeconds) },
    },
  );
}

type ParsedBody = { messages: ChatMessage[] };

function parseMessages(body: unknown): ParsedBody | { error: string } {
  if (typeof body !== "object" || body === null || !("messages" in body)) {
    return { error: "Body must be { messages: [...] }." };
  }
  const raw = (body as { messages: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "messages must be a non-empty array." };
  }
  if (raw.length > MAX_MESSAGES) {
    return { error: `Too many messages (max ${MAX_MESSAGES}).` };
  }

  const messages: ChatMessage[] = [];
  let totalChars = 0;
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return { error: "Each message must be an object." };
    }
    const { role, text } = item as { role?: unknown; text?: unknown };
    if (role !== "user" && role !== "model") {
      return { error: 'Each message role must be "user" or "model".' };
    }
    if (typeof text !== "string") {
      return { error: "Each message text must be a string." };
    }
    const trimmed = text.trim();
    if (trimmed === "") {
      return { error: "Message text must not be empty." };
    }
    if (trimmed.length > MAX_MESSAGE_CHARS) {
      return { error: `A message is too long (max ${MAX_MESSAGE_CHARS}).` };
    }
    totalChars += trimmed.length;
    messages.push({ role, text: trimmed });
  }

  if (totalChars > MAX_TOTAL_CHARS) {
    return { error: `Conversation is too long (max ${MAX_TOTAL_CHARS}).` };
  }
  if (messages[messages.length - 1].role !== "user") {
    return { error: "The last message must be from the user." };
  }
  return { messages };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const limit = checkRateLimit(user.username, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return rateLimitedResponse(limit.retryAfterSeconds);
  }

  // Global ceiling so a flood of distinct accounts on one instance can't blow
  // past the aggregate the per-user cap would otherwise allow.
  const globalLimit = checkRateLimit(
    GLOBAL_RATE_KEY,
    globalRateLimit(),
    RATE_WINDOW_MS,
  );
  if (!globalLimit.ok) {
    return rateLimitedResponse(globalLimit.retryAfterSeconds);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: NO_STORE },
    );
  }

  const parsed = parseMessages(body);
  if ("error" in parsed) {
    return Response.json(
      { error: parsed.error },
      { status: 400, headers: NO_STORE },
    );
  }

  // The caller's class, derived from the session — drives class-private tool
  // scoping. null for non-students (teachers / committee / admin). classOf
  // returns a validated class string; isClassName narrows it to ClassName.
  const rawClass = classOf(user.username);
  const viewer = {
    className: rawClass !== null && isClassName(rawClass) ? rawClass : null,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of runChat(
          parsed.messages,
          viewer,
          request.signal,
        )) {
          controller.enqueue(encoder.encode(delta));
        }
      } catch (error) {
        // Client gets a short note; the cause stays in the server logs.
        console.error("[chat] generation error", error);
        controller.enqueue(
          encoder.encode(
            "\n\n（エラーが発生しました。時間をおいて再度お試しください。）",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      // Tell nginx (production) not to buffer the streamed response.
      "x-accel-buffering": "no",
    },
  });
}
