import { describe, expect, it } from "vitest";
import { formatPortalFte } from "./portal-fte";

describe("formatPortalFte", () => {
  it.each([0.0013, 0.00001, 0.0049, 0.005, 0.0099, 0.01])(
    "preserves positive FTE %s as 0.01",
    (value) => expect(formatPortalFte(value)).toBe("0.01"),
  );
  it.each([[0.014, "0.01"], [0.015, "0.02"], [1.005, "1.01"], [2.126, "2.13"], [2, "2.00"]])(
    "rounds %s to %s without always rounding up",
    (value, expected) => expect(formatPortalFte(Number(value))).toBe(expected),
  );
  it("preserves a genuine zero and missing values", () => {
    expect(formatPortalFte(0)).toBe("0.00");
    expect(formatPortalFte(null)).toBeNull();
    expect(formatPortalFte(undefined)).toBeNull();
  });
  it.each([-1, NaN, Infinity])("rejects invalid FTE %s", (value) => {
    expect(() => formatPortalFte(value)).toThrow("FTE must be");
  });
});
