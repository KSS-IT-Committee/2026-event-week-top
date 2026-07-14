import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns ok:true with retryAfterSeconds:0 on the first call for a key", () => {
    const result = checkRateLimit("first-call", 5, 1000);
    expect(result).toEqual({ ok: true, retryAfterSeconds: 0 });
  });

  it("allows calls up to the limit then blocks (limit=2, window=1000)", () => {
    const key = "limit-2-window-1000";

    const call1 = checkRateLimit(key, 2, 1000);
    expect(call1).toEqual({ ok: true, retryAfterSeconds: 0 });

    const call2 = checkRateLimit(key, 2, 1000);
    expect(call2).toEqual({ ok: true, retryAfterSeconds: 0 });

    const call3 = checkRateLimit(key, 2, 1000);
    expect(call3.ok).toBe(false);
    expect(call3.retryAfterSeconds).toBe(1);
  });

  it("blocks the second call when limit=1 (window=60000) with retryAfterSeconds=60", () => {
    const key = "limit-1-window-60000";

    const call1 = checkRateLimit(key, 1, 60000);
    expect(call1).toEqual({ ok: true, retryAfterSeconds: 0 });

    const call2 = checkRateLimit(key, 1, 60000);
    expect(call2.ok).toBe(false);
    expect(call2.retryAfterSeconds).toBe(60);
  });

  it("rounds retryAfterSeconds up via ceil (window=1500 -> 2)", () => {
    const key = "rounding-window-1500";

    const call1 = checkRateLimit(key, 1, 1500);
    expect(call1).toEqual({ ok: true, retryAfterSeconds: 0 });

    const call2 = checkRateLimit(key, 1, 1500);
    expect(call2.ok).toBe(false);
    expect(call2.retryAfterSeconds).toBe(2);
  });

  it("applies ceil and the max(1, ...) floor as the window winds down", () => {
    const key = "rounding-floor-window-1500";

    expect(checkRateLimit(key, 1, 1500)).toEqual({
      ok: true,
      retryAfterSeconds: 0,
    });

    // resetAt = 1500, now = 1100 -> remaining 400ms -> ceil(0.4) = 1.
    vi.setSystemTime(1100);
    const blocked = checkRateLimit(key, 1, 1500);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("enforces the max(1, ...) floor when remaining is under one second", () => {
    const key = "max-floor-window-1000";

    expect(checkRateLimit(key, 1, 1000)).toEqual({
      ok: true,
      retryAfterSeconds: 0,
    });

    // resetAt = 1000, now = 999 -> remaining 1ms -> ceil(0.001) = 1.
    vi.setSystemTime(999);
    const blocked = checkRateLimit(key, 1, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("resets the window once now >= resetAt", () => {
    const key = "window-reset-window-1000";

    expect(checkRateLimit(key, 1, 1000)).toEqual({
      ok: true,
      retryAfterSeconds: 0,
    });

    vi.setSystemTime(999);
    const blocked = checkRateLimit(key, 1, 1000);
    expect(blocked.ok).toBe(false);

    vi.setSystemTime(1000);
    const afterReset = checkRateLimit(key, 1, 1000);
    expect(afterReset).toEqual({ ok: true, retryAfterSeconds: 0 });
  });

  it("starts a fresh window after reset that can be exhausted again", () => {
    const key = "fresh-window-after-reset";

    expect(checkRateLimit(key, 1, 1000).ok).toBe(true);

    vi.setSystemTime(1000);
    expect(checkRateLimit(key, 1, 1000).ok).toBe(true);

    // Still within the new window (resetAt = 2000).
    vi.setSystemTime(1500);
    const blocked = checkRateLimit(key, 1, 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("captures resetAt at the first call of the window, not later calls", () => {
    const key = "resetat-captured-at-first-call";

    // First call at t=0 -> resetAt = 10000.
    expect(checkRateLimit(key, 2, 10000).ok).toBe(true);

    // Second call at t=3000 is still allowed and does not change resetAt.
    vi.setSystemTime(3000);
    expect(checkRateLimit(key, 2, 10000).ok).toBe(true);

    // Third call at t=3000 is blocked; remaining = 10000 - 3000 = 7000ms -> 7s.
    const blocked = checkRateLimit(key, 2, 10000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(7);
  });

  it("keeps independent keys in separate buckets", () => {
    const keyA = "independent-key-a";
    const keyB = "independent-key-b";

    expect(checkRateLimit(keyA, 1, 1000)).toEqual({
      ok: true,
      retryAfterSeconds: 0,
    });
    // keyB still gets its own first-call ok despite keyA being exhausted.
    expect(checkRateLimit(keyB, 1, 1000)).toEqual({
      ok: true,
      retryAfterSeconds: 0,
    });

    // keyA is now blocked, keyB is now blocked, independently.
    expect(checkRateLimit(keyA, 1, 1000).ok).toBe(false);
    expect(checkRateLimit(keyB, 1, 1000).ok).toBe(false);
  });
});
