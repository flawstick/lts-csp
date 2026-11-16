import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { ReturnWorkspaceHeader } from "./return-workspace-header";
import type { PortalReturnRecord } from "./return-workspace-shared";

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgId: "org-1" }),
}));
vi.mock("@/lib/navigate-with-transition", () => ({
  useNavigateWithTransition: () => () => {},
}));
vi.mock("@/components/view-transitions", () => ({
  SharedElement: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/portal-client-access-actions", () => ({
  PortalClientAccessMenuSection: () => null,
}));

const selectedReturn = {
  id: "return-1",
  entityName: "Example Holdings (Guernsey) Limited",
  jurisdictionName: "Guernsey",
  jurisdictionCode: "GG",
  taxYear: 2025,
  externalId: null,
} as unknown as PortalReturnRecord;

const pendingReapproval = {
  at: "2026-11-12T14:00:00.000Z",
  source: "web",
  changedFields: ["adequacyExpenditureDetails", "hasAdequateEmployees"],
  previousSignoffAt: "2026-11-05T09:00:00.000Z",
};

function renderHeader(
  props: Partial<Parameters<typeof ReturnWorkspaceHeader>[0]> = {},
) {
  return render(
    <TooltipProvider>
      <ReturnWorkspaceHeader
        activeSectionTitle={null}
        selectedReturn={selectedReturn}
        selectedStatus="review_required"
        onOpenFinishSheet={() => {}}
        onMarkReadyForSubmission={() => {}}
        onRevertReadyForSubmission={() => {}}
        {...props}
      />
    </TooltipProvider>,
  );
}

describe("ReturnWorkspaceHeader re-approval", () => {
  it("offers an enabled re-approval action and says what changed", () => {
    renderHeader({
      canApproveFilings: true,
      isSubmittable: true,
      pendingReapproval,
    });

    expect(screen.getByText("Re-approval needed")).toBeInTheDocument();
    expect(screen.getByTestId("reapproval-required")).toHaveTextContent(
      "Operating Expenditure Relating to the Activity, Adequate Number of Employees?",
    );
    expect(
      screen.getByRole("button", { name: /re-approve for filing/i }),
    ).toBeEnabled();
  });

  it("tells members who cannot approve that a signatory must approve again", () => {
    renderHeader({ canApproveFilings: false, isSubmittable: true, pendingReapproval });

    expect(screen.getByTestId("reapproval-required")).toHaveTextContent(
      /authorised signatory reviews the current figures/,
    );
    expect(
      screen.queryByRole("button", { name: /re-approve for filing/i }),
    ).not.toBeInTheDocument();
  });

  it("shows why approval is unavailable instead of only greying the button", () => {
    renderHeader({
      canApproveFilings: true,
      isSubmittable: false,
      submittabilityBlockReason: "Attach the signed financial statements.",
      pendingReapproval,
    });

    expect(
      screen.getByRole("button", { name: /re-approve for filing/i }),
    ).toBeDisabled();
    expect(screen.getByTestId("approval-blocked-reason")).toHaveTextContent(
      "Attach the signed financial statements.",
    );
  });

  it("shows the plain approval action when no earlier signoff was revoked", () => {
    renderHeader({ canApproveFilings: true, isSubmittable: true });

    expect(screen.queryByText("Re-approval needed")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /submit for filing/i }),
    ).toBeEnabled();
  });
});
