import type { Checks } from "../browser";
import type { SeedResult } from "../seed";
import { attentionFlows } from "./attention";
import { portalFlows } from "./portal";
import { smokeFlows } from "./smoke";
import { webFlows } from "./web";
import { workerFlows } from "./worker";

export type FlowContext = {
  seeded: SeedResult;
  webUrl: string;
  portalUrl: string;
  /** Values one flow leaves for a later one (e.g. the job id it queued). */
  shared: Record<string, string>;
};
export type Flow = { name: string; needsPortal?: boolean; run: (ctx: FlowContext, c: Checks) => Promise<void> };

// Order matters: the worker check reads the job the (a) flow queued, and the
// portal re-sign-off of (f) follows the staff edit that cleared it.
export const flows: Flow[] = [...smokeFlows, ...webFlows, ...attentionFlows, ...workerFlows, ...portalFlows];
