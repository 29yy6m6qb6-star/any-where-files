import { describe, expect, it } from "vitest";
import { generateTransferKey } from "./db";

describe("Transfer Key Generation", () => {
  it("generates an 11-digit string", () => {
    const key = generateTransferKey();
    expect(key).toMatch(/^\d{11}$/);
    expect(key.length).toBe(11);
  });

  it("generates different keys on multiple calls", () => {
    const keys = new Set();
    for (let i = 0; i < 100; i++) {
      keys.add(generateTransferKey());
    }
    // With 100 calls, we should have many different keys
    // (collision probability is very low)
    expect(keys.size).toBeGreaterThan(90);
  });

  it("generates keys with leading zeros when needed", () => {
    // Test that padding works correctly
    let foundWithLeadingZero = false;
    for (let i = 0; i < 1000; i++) {
      const key = generateTransferKey();
      if (key.startsWith("0")) {
        foundWithLeadingZero = true;
        break;
      }
    }
    expect(foundWithLeadingZero).toBe(true);
  });

  it("generates keys only with digits", () => {
    for (let i = 0; i < 100; i++) {
      const key = generateTransferKey();
      expect(/^\d+$/.test(key)).toBe(true);
    }
  });
});
