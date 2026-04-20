import { describe, expect, it } from "vitest";

import type { FormSection } from "../../_components/return-workspace-shared";
import { FORM_SECTIONS } from "@/lib/schemas/substance-form";

import { buildSteps, FINAL_STEP_ID } from "./guided-sidebar";

describe("buildSteps", () => {
  const visibleSections: FormSection[] = [FORM_SECTIONS[0]!];

  it("keeps the financial pack step for certificate 3 flows", () => {
    expect(buildSteps(visibleSections).map((step) => step.id)).toContain(
      FINAL_STEP_ID,
    );
  });

  it("omits the financial pack step for certificate 2 flows", () => {
    expect(
      buildSteps(visibleSections, { includeFinancialPack: false }).map(
        (step) => step.id,
      ),
    ).not.toContain(FINAL_STEP_ID);
  });
});
