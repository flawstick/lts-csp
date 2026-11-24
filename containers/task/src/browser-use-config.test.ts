import { describe, expect, it } from "vitest";
import {
  DEFAULT_FINAL_PROFILE,
  DEFAULT_PREPARE_PROFILE,
  isBudgetExhausted,
  modelParamsForProfile,
  profileForSubmissionMode,
  resolveBrowserUseRunConfig,
} from "./browser-use-config";

describe("resolveBrowserUseRunConfig", () => {
  it("defaults prepare-only to Sonnet 5 / medium / $4 and final to Opus 5.5 / high / $6", () => {
    const result = resolveBrowserUseRunConfig({});
    expect(result).toEqual({
      ok: true,
      config: { prepare: DEFAULT_PREPARE_PROFILE, final: DEFAULT_FINAL_PROFILE },
    });
    if (!result.ok) return;
    expect(profileForSubmissionMode(result.config, "prepare_only")).toMatchObject({
      model: "claude-sonnet-5",
      effort: "medium",
      maxCostUsd: 4,
    });
    expect(
      profileForSubmissionMode(result.config, "submit_and_capture_pdf"),
    ).toMatchObject({ model: "claude-opus-5-5", effort: "high", maxCostUsd: 6 });
  });

  it("accepts explicit, supported overrides", () => {
    const result = resolveBrowserUseRunConfig({
      BROWSER_USE_PREPARE_MODEL: "claude-opus-5-5",
      BROWSER_USE_PREPARE_EFFORT: "high",
      BROWSER_USE_PREPARE_MAX_COST_USD: "5.50",
      BROWSER_USE_FINAL_MAX_COST_USD: "8",
      BROWSER_USE_FINAL_EFFORT: "xhigh",
    });
    expect(result.ok && result.config.prepare).toEqual({
      kind: "prepare",
      model: "claude-opus-5-5",
      effort: "high",
      maxCostUsd: 5.5,
    });
    expect(result.ok && result.config.final).toMatchObject({
      model: "claude-opus-5-5",
      effort: "xhigh",
      maxCostUsd: 8,
    });
  });

  it.each([
    [{ BROWSER_USE_PREPARE_MODEL: "gpt-6-luna" }, "BROWSER_USE_PREPARE_MODEL"],
    [{ BROWSER_USE_FINAL_MODEL: "claude-opus-5-6" }, "BROWSER_USE_FINAL_MODEL"],
    [{ BROWSER_USE_PREPARE_EFFORT: "extreme" }, "BROWSER_USE_PREPARE_EFFORT"],
    // Final filing never runs with reduced reasoning.
    [{ BROWSER_USE_FINAL_EFFORT: "medium" }, "BROWSER_USE_FINAL_EFFORT"],
    [{ BROWSER_USE_FINAL_MAX_COST_USD: "0" }, "BROWSER_USE_FINAL_MAX_COST_USD"],
    [{ BROWSER_USE_PREPARE_MAX_COST_USD: "30" }, "BROWSER_USE_PREPARE_MAX_COST_USD"],
    [{ BROWSER_USE_PREPARE_MAX_COST_USD: "4usd" }, "BROWSER_USE_PREPARE_MAX_COST_USD"],
    [{ BROWSER_USE_PREPARE_MAX_COST_USD: "-1" }, "BROWSER_USE_PREPARE_MAX_COST_USD"],
  ])("refuses invalid configuration %j instead of falling back", (env, name) => {
    const result = resolveBrowserUseRunConfig(env);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain(name);
  });

  it("ignores blank values", () => {
    expect(
      resolveBrowserUseRunConfig({ BROWSER_USE_PREPARE_MODEL: "  " }),
    ).toMatchObject({ ok: true });
  });

  it("builds documented Anthropic model params", () => {
    expect(modelParamsForProfile(DEFAULT_PREPARE_PROFILE)).toEqual({
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
    });
  });
});

describe("isBudgetExhausted", () => {
  it("recognises a budget error message", () => {
    expect(
      isBudgetExhausted({
        runError: "Session budget exceeded (maxCostUsd)",
        maxCostUsd: 4,
      }),
    ).toBe(true);
  });

  it("recognises spend at the cap", () => {
    expect(isBudgetExhausted({ budgetSpentUsd: 3.98, maxCostUsd: 4 })).toBe(true);
    expect(isBudgetExhausted({ budgetSpentUsd: 1.5, maxCostUsd: 4 })).toBe(false);
  });

  it("does not treat other failures as budget exhaustion", () => {
    expect(
      isBudgetExhausted({
        runError: "Browser crashed",
        budgetSpentUsd: null,
        maxCostUsd: 4,
      }),
    ).toBe(false);
  });
});
