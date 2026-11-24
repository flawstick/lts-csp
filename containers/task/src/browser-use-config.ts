/**
 * Browser Use model, reasoning effort and session budget per filing mode.
 *
 * Prepare-only runs (including their same-session follow-ups) never file, are
 * stopped before submission by the prepare-only guard extension, and default
 * to a cheaper model. Final filing modes keep Opus 5.5 unless an explicit,
 * validated override is configured. Invalid configuration never falls back to
 * another model: the job is refused before any browser run starts.
 *
 * Supported models and modelParams follow the Browser Use V4 thinking-levels
 * table: these Claude models accept `thinking.type: "adaptive"` and
 * `output_config.effort` in low|medium|high|xhigh|max.
 */

import type { SubmissionMode } from "./run-outcome";

export const SUPPORTED_BROWSER_USE_MODELS = [
  "claude-sonnet-5",
  "claude-opus-5",
  "claude-opus-5-5",
] as const;
export type BrowserUseModel = (typeof SUPPORTED_BROWSER_USE_MODELS)[number];

export const BROWSER_USE_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type BrowserUseEffort = (typeof BROWSER_USE_EFFORTS)[number];

/** Final filing never runs with reduced reasoning. */
const FINAL_MIN_EFFORTS: readonly BrowserUseEffort[] = ["high", "xhigh", "max"];

/** Browser Use's own default session budget, kept as the hard ceiling. */
export const MAX_SESSION_BUDGET_USD = 25;

export type BrowserUseRunProfile = {
  kind: "prepare" | "final";
  model: BrowserUseModel;
  effort: BrowserUseEffort;
  /** USD budget for the whole Browser Use session, follow-ups included. */
  maxCostUsd: number;
};

export const DEFAULT_PREPARE_PROFILE: BrowserUseRunProfile = {
  kind: "prepare",
  model: "claude-sonnet-5",
  effort: "medium",
  maxCostUsd: 4,
};

export const DEFAULT_FINAL_PROFILE: BrowserUseRunProfile = {
  kind: "final",
  model: "claude-opus-5-5",
  effort: "high",
  maxCostUsd: 6,
};

export type BrowserUseRunConfig = {
  prepare: BrowserUseRunProfile;
  final: BrowserUseRunProfile;
};

export type BrowserUseRunConfigResult =
  | { ok: true; config: BrowserUseRunConfig }
  | { ok: false; error: string };

type Env = Record<string, string | undefined>;

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseProfile(
  env: Env,
  prefix: "BROWSER_USE_PREPARE" | "BROWSER_USE_FINAL",
  defaults: BrowserUseRunProfile,
  errors: string[],
): BrowserUseRunProfile {
  const profile = { ...defaults };

  const model = readEnv(env, `${prefix}_MODEL`);
  if (model !== undefined) {
    if ((SUPPORTED_BROWSER_USE_MODELS as readonly string[]).includes(model)) {
      profile.model = model as BrowserUseModel;
    } else {
      errors.push(
        `${prefix}_MODEL must be one of ${SUPPORTED_BROWSER_USE_MODELS.join(", ")}`,
      );
    }
  }

  const effort = readEnv(env, `${prefix}_EFFORT`);
  if (effort !== undefined) {
    const allowed =
      defaults.kind === "final" ? FINAL_MIN_EFFORTS : BROWSER_USE_EFFORTS;
    if ((allowed as readonly string[]).includes(effort)) {
      profile.effort = effort as BrowserUseEffort;
    } else {
      errors.push(`${prefix}_EFFORT must be one of ${allowed.join(", ")}`);
    }
  }

  const budget = readEnv(env, `${prefix}_MAX_COST_USD`);
  if (budget !== undefined) {
    const value = /^\d+(?:\.\d{1,2})?$/.test(budget) ? Number(budget) : NaN;
    if (
      Number.isFinite(value) &&
      value > 0 &&
      value <= MAX_SESSION_BUDGET_USD
    ) {
      profile.maxCostUsd = value;
    } else {
      errors.push(
        `${prefix}_MAX_COST_USD must be a USD amount above 0 and at most ${MAX_SESSION_BUDGET_USD}`,
      );
    }
  }

  return profile;
}

export function resolveBrowserUseRunConfig(
  env: Env,
): BrowserUseRunConfigResult {
  const errors: string[] = [];
  const prepare = parseProfile(
    env,
    "BROWSER_USE_PREPARE",
    DEFAULT_PREPARE_PROFILE,
    errors,
  );
  const final = parseProfile(
    env,
    "BROWSER_USE_FINAL",
    DEFAULT_FINAL_PROFILE,
    errors,
  );
  if (errors.length) {
    return {
      ok: false,
      error: `Invalid Browser Use configuration: ${errors.join("; ")}`,
    };
  }
  return { ok: true, config: { prepare, final } };
}

/** prepare_only (and its follow-ups) vs every mode that may file. */
export function profileForSubmissionMode(
  config: BrowserUseRunConfig,
  submissionMode: SubmissionMode,
): BrowserUseRunProfile {
  return submissionMode === "prepare_only" ? config.prepare : config.final;
}

export function modelParamsForProfile(profile: BrowserUseRunProfile) {
  return {
    thinking: { type: "adaptive" },
    output_config: { effort: profile.effort },
  };
}

const BUDGET_ERROR_PATTERN =
  /\b(?:budget|max[_ ]?cost(?:[_ ]?usd)?|cost[_ ]?cap|spend(?:ing)?[_ ]?(?:cap|limit))\b/i;

/** Within this many USD of the cap, a stopped run is treated as out of budget. */
const BUDGET_EXHAUSTED_MARGIN_USD = 0.05;

/**
 * Whether an unsuccessful run stopped because its session budget ran out.
 * Browser Use does not document a dedicated status for this, so use both the
 * run error text and the recorded budgeted spend (LLM + search).
 */
export function isBudgetExhausted(input: {
  runError?: string | null;
  budgetSpentUsd?: number | null;
  maxCostUsd: number;
}): boolean {
  if (input.runError && BUDGET_ERROR_PATTERN.test(input.runError)) return true;
  return (
    typeof input.budgetSpentUsd === "number" &&
    Number.isFinite(input.budgetSpentUsd) &&
    input.budgetSpentUsd >= input.maxCostUsd - BUDGET_EXHAUSTED_MARGIN_USD
  );
}
