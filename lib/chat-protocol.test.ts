import { describe, expect, it } from "vitest";

import { CHAT_RESET_SIGNAL } from "@/lib/chat-protocol";

describe("CHAT_RESET_SIGNAL", () => {
  it("is a string of length 1", () => {
    expect(typeof CHAT_RESET_SIGNAL).toBe("string");
    expect(CHAT_RESET_SIGNAL.length).toBe(1);
  });

  it("equals the U+E000 code point", () => {
    expect(CHAT_RESET_SIGNAL.codePointAt(0)).toBe(0xe000);
    expect(CHAT_RESET_SIGNAL).toBe(String.fromCharCode(0xe000));
  });

  it("is a single Private-Use-Area character (U+E000–U+F8FF)", () => {
    const codePoint = CHAT_RESET_SIGNAL.codePointAt(0)!;
    expect(codePoint).toBeGreaterThanOrEqual(0xe000);
    expect(codePoint).toBeLessThanOrEqual(0xf8ff);
    // A single code unit (no surrogate pair).
    expect([...CHAT_RESET_SIGNAL]).toHaveLength(1);
  });
});
