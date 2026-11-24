import { afterEach, describe, expect, it } from "vitest";
import {
  assertFilingAutomationAvailable,
  FilingMaintenanceError,
  formatUkInstant,
  getFilingMaintenance,
  getFilingMaintenanceState,
  parseFilingMaintenanceUntil,
} from "./filing-maintenance";

const UNTIL = "2026-11-24T14:00:00Z";
const at = (iso: string) => new Date(iso);

describe("getFilingMaintenanceState", () => {
  it("is inactive when unset or empty", () => {
    expect(getFilingMaintenanceState(undefined).active).toBe(false);
    expect(getFilingMaintenanceState("").active).toBe(false);
    expect(getFilingMaintenanceState("   ").active).toBe(false);
  });

  it("blocks launches before the end instant", () => {
    const state = getFilingMaintenanceState(UNTIL, at("2026-11-24T09:30:00Z"));
    expect(state.active).toBe(true);
    expect(state.until).toBe("2026-11-24T14:00:00.000Z");
    expect(state.message).toContain("14:00 GMT on 24 November 2026");
  });

  it("still blocks one millisecond before the end instant", () => {
    expect(
      getFilingMaintenanceState(UNTIL, at("2026-11-24T13:59:59.999Z")).active,
    ).toBe(true);
  });

  it("allows launches at exactly the end instant", () => {
    expect(
      getFilingMaintenanceState(UNTIL, at("2026-11-24T14:00:00.000Z")),
    ).toEqual({ active: false, until: null, message: null });
  });

  it("allows launches after the end instant", () => {
    expect(
      getFilingMaintenanceState(UNTIL, at("2026-11-24T14:00:00.001Z")).active,
    ).toBe(false);
    expect(
      getFilingMaintenanceState(UNTIL, at("2026-11-25T08:00:00Z")).active,
    ).toBe(false);
  });

  it("honours an explicit non-UTC offset", () => {
    const raw = "2026-11-24T15:00:00+01:00";
    expect(getFilingMaintenanceState(raw, at("2026-11-24T13:59:59Z")).active).toBe(true);
    expect(getFilingMaintenanceState(raw, at("2026-11-24T14:00:00Z")).active).toBe(false);
  });

  it("keeps maintenance on for a value without an offset or that cannot be parsed", () => {
    for (const raw of ["2026-11-24T14:00:00", "2pm today", "2026-13-45T99:00:00Z"]) {
      const state = getFilingMaintenanceState(raw, at("2030-01-01T00:00:00Z"));
      expect(state.active).toBe(true);
      expect(state.until).toBeNull();
    }
  });
});

describe("parseFilingMaintenanceUntil", () => {
  it("parses Z and offset instants", () => {
    expect(parseFilingMaintenanceUntil(UNTIL)).toEqual(at(UNTIL));
    expect(parseFilingMaintenanceUntil("2026-11-24T14:00Z")).toEqual(at(UNTIL));
  });
});

describe("formatUkInstant", () => {
  it("uses BST in summer", () => {
    expect(formatUkInstant(at("2026-07-01T13:00:00Z"))).toBe(
      "14:00 BST on 1 July 2026",
    );
  });
});

describe("getFilingMaintenance (env)", () => {
  const original = process.env.FILING_MAINTENANCE_UNTIL;
  afterEach(() => {
    if (original === undefined) delete process.env.FILING_MAINTENANCE_UNTIL;
    else process.env.FILING_MAINTENANCE_UNTIL = original;
  });

  it("reads FILING_MAINTENANCE_UNTIL and expires on its own", () => {
    process.env.FILING_MAINTENANCE_UNTIL = UNTIL;
    expect(getFilingMaintenance(at("2026-11-24T13:00:00Z")).active).toBe(true);
    expect(getFilingMaintenance(at("2026-11-24T14:00:00Z")).active).toBe(false);

    expect(() =>
      assertFilingAutomationAvailable(at("2026-11-24T13:00:00Z")),
    ).toThrow(FilingMaintenanceError);
    expect(() =>
      assertFilingAutomationAvailable(at("2026-11-24T14:00:00Z")),
    ).not.toThrow();
  });

  it("does nothing when unset", () => {
    delete process.env.FILING_MAINTENANCE_UNTIL;
    expect(() => assertFilingAutomationAvailable()).not.toThrow();
  });
});
