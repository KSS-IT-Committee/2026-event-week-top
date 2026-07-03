import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHAT_MODELS,
  chatModelOrder,
  isModelUnavailableError,
  MAX_MODEL_ATTEMPTS,
  noteModelUnavailable,
} from "@/lib/gemini";

describe("isModelUnavailableError", () => {
  it("returns false for non-object values", () => {
    expect(isModelUnavailableError(null)).toBe(false);
    expect(isModelUnavailableError(undefined)).toBe(false);
    expect(isModelUnavailableError("UNAVAILABLE")).toBe(false);
    expect(isModelUnavailableError(429)).toBe(false);
    expect(isModelUnavailableError(true)).toBe(false);
  });

  it("returns true for retryable status codes", () => {
    expect(isModelUnavailableError({ status: 429 })).toBe(true);
    expect(isModelUnavailableError({ status: 503 })).toBe(true);
  });

  it("returns false for non-retryable status codes", () => {
    expect(isModelUnavailableError({ status: 400 })).toBe(false);
    expect(isModelUnavailableError({ status: 500 })).toBe(false);
  });

  it("returns true for messages matching the unavailable pattern", () => {
    expect(
      isModelUnavailableError({ message: "error: RESOURCE_EXHAUSTED quota" }),
    ).toBe(true);
    expect(isModelUnavailableError({ message: "UNAVAILABLE" })).toBe(true);
    expect(isModelUnavailableError({ message: "quota exceeded" })).toBe(true);
    expect(isModelUnavailableError({ message: "QUOTA EXCEEDED" })).toBe(true);
    expect(isModelUnavailableError({ message: "model is overloaded" })).toBe(
      true,
    );
    expect(
      isModelUnavailableError({ message: "Error 429 Too Many Requests" }),
    ).toBe(true);
    expect(isModelUnavailableError({ message: "got a 503" })).toBe(true);
  });

  it("requires a word boundary around the numeric codes", () => {
    expect(isModelUnavailableError({ message: "request id 4290 failed" })).toBe(
      false,
    );
    expect(isModelUnavailableError({ message: "totally fine" })).toBe(false);
  });

  it("prefers status over message", () => {
    expect(
      isModelUnavailableError({ status: 429, message: "totally fine" }),
    ).toBe(true);
    expect(
      isModelUnavailableError({ status: 503, message: "totally fine" }),
    ).toBe(true);
  });

  it("matches on message even with a benign or absent status", () => {
    expect(
      isModelUnavailableError({ status: 200, message: "quota exceeded" }),
    ).toBe(true);
    expect(isModelUnavailableError({ message: "UNAVAILABLE" })).toBe(true);
  });
});

describe("constants", () => {
  it("MAX_MODEL_ATTEMPTS is 3", () => {
    expect(MAX_MODEL_ATTEMPTS).toBe(3);
  });

  it("CHAT_MODELS is a non-empty array of strings", () => {
    expect(Array.isArray(CHAT_MODELS)).toBe(true);
    expect(CHAT_MODELS.length).toBeGreaterThan(0);
    for (const model of CHAT_MODELS) {
      expect(typeof model).toBe("string");
    }
  });
});

describe("chatModelOrder + noteModelUnavailable (cooldown ordering)", () => {
  // The cooldown Map is module-level and persists across tests in this file, so
  // each test starts at a fresh, larger base time to ensure cooldowns recorded
  // by earlier tests are already in the past.
  let base = 1_000_000_000_000;

  beforeEach(() => {
    base += 1_000_000_000; // jump well past any prior cooldown
    vi.useFakeTimers();
    vi.setSystemTime(base);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the original order when nothing is cooling and no env override", () => {
    expect(chatModelOrder()).toEqual([...CHAT_MODELS]);
  });

  it("pins a single model when GEMINI_MODEL is set", () => {
    vi.stubEnv("GEMINI_MODEL", "my-model");
    expect(chatModelOrder()).toEqual(["my-model"]);
  });

  it("demotes a cooling model to the back, then restores it after the cooldown lapses", () => {
    noteModelUnavailable(CHAT_MODELS[0]); // default 60_000ms cooldown

    const order = chatModelOrder();
    // All models still present.
    expect(order.length).toBe(CHAT_MODELS.length);
    expect([...order].sort()).toEqual([...CHAT_MODELS].sort());
    // The cooling model is last.
    expect(order[order.length - 1]).toBe(CHAT_MODELS[0]);
    // Non-cooling models keep their original relative order.
    expect(order.slice(0, -1)).toEqual([...CHAT_MODELS].slice(1));

    // Just before the cooldown lapses it is still demoted.
    vi.setSystemTime(base + 59_999);
    expect(chatModelOrder()[chatModelOrder().length - 1]).toBe(CHAT_MODELS[0]);

    // After the cooldown lapses it returns to the front.
    vi.setSystemTime(base + 60_000);
    expect(chatModelOrder()).toEqual([...CHAT_MODELS]);
  });

  it("honors a plain retryDelay of 5s from the error", () => {
    noteModelUnavailable(CHAT_MODELS[1], {
      message: 'retryDelay: "5s"',
    });

    // Still cooling at +4s.
    vi.setSystemTime(base + 4_000);
    expect(chatModelOrder()[chatModelOrder().length - 1]).toBe(CHAT_MODELS[1]);

    // Ready again at +5s.
    vi.setSystemTime(base + 5_000);
    expect(chatModelOrder()).toEqual([...CHAT_MODELS]);
  });

  it("parses the double-escaped JSON form the API emits (~58s)", () => {
    // The Gemini error body is double-encoded JSON, so the field arrives with
    // escaped quotes/backslashes between the key and the number.
    const message = '...{\\"retryDelay\\": \\"58s\\"}...';
    noteModelUnavailable(CHAT_MODELS[2], { message });

    // Still cooling just before 58s.
    vi.setSystemTime(base + 57_999);
    expect(chatModelOrder()[chatModelOrder().length - 1]).toBe(CHAT_MODELS[2]);

    // Ready exactly at 58s.
    vi.setSystemTime(base + 58_000);
    expect(chatModelOrder()).toEqual([...CHAT_MODELS]);
  });
});
