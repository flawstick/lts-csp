import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrowserToolbar, type ToolbarSubmitReadiness } from "./browser-toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderToolbar(
  onStart = vi.fn(),
  extra: {
    submitReadiness?: ToolbarSubmitReadiness | null;
    onActionsMenuOpen?: () => void;
    noticeOfAssessmentLabel?: string | null;
  } = {},
) {
  render(<TooltipProvider><BrowserToolbar {...extra}
    orgId="org" jurisdictionName="Guernsey" entityName="Example Entity"
    taskStatus="pending" isConnected={false} liveUrl={null}
    iframeRef={{ current: null }} allJobs={[]} selectedJobId={null} selectedJob={null}
    activeJob={null} runningJob={null} pausedJob={null}
    onSelectJob={vi.fn()} onPause={vi.fn()} onCancel={vi.fn()} onResume={vi.fn()}
    onStart={onStart} onDeleteJob={vi.fn()}
    isStartPending={false} isPausePending={false} isCancelPending={false}
    isResumePending={false} isDeletePending={false}
  /></TooltipProvider>);
  return onStart;
}

describe("filing preparation action", () => {
  it("starts preparation from the primary action without submission permission", () => {
    const onStart = vi.fn();
    render(<TooltipProvider><BrowserToolbar
      orgId="org" jurisdictionName="Guernsey" entityName="Example Entity"
      taskStatus="pending" isConnected={false} liveUrl={null}
      iframeRef={{ current: null }} allJobs={[]} selectedJobId={null} selectedJob={null}
      activeJob={null} runningJob={null} pausedJob={null}
      onSelectJob={vi.fn()} onPause={vi.fn()} onCancel={vi.fn()} onResume={vi.fn()}
      onStart={onStart} onDeleteJob={vi.fn()}
      isStartPending={false} isPausePending={false} isCancelPending={false}
      isResumePending={false} isDeletePending={false}
    /></TooltipProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Prepare only" }));
    expect(onStart).toHaveBeenCalledWith({ submissionMode: "prepare_only", overrideSaved: false });
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
  });
});

describe("final submission confirmation", () => {
  async function openSubmitDialog() {
    const onStart = renderToolbar();
    const trigger = screen.getByRole("button", { name: /More/ });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Submit return \+ save PDF/ }));
    await screen.findByRole("alertdialog");
    return onStart;
  }

  it("keeps Submit disabled until the reviewer acknowledges the review", async () => {
    const onStart = await openSubmitDialog();
    const submit = screen.getByRole("button", { name: "Submit return" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onStart).toHaveBeenCalledWith({
      submissionMode: "submit_and_capture_pdf",
      overrideSaved: false,
    });
  });

  it("cancels without starting a run", async () => {
    const onStart = await openSubmitDialog();
    fireEvent.click(screen.getByRole("button", { name: "Keep reviewing" }));
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe("submit prepared return confirmation", () => {
  async function openPreparedDialog() {
    const onStart = renderToolbar();
    const trigger = screen.getByRole("button", { name: /More/ });
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Submit prepared/ }));
    await screen.findByRole("alertdialog");
    return onStart;
  }

  it("requires acknowledgement, then starts the submit_prepared operation", async () => {
    const onStart = await openPreparedDialog();
    expect(screen.getByText("Submit the prepared return?")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Submit prepared return" });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(onStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(submit);
    expect(onStart).toHaveBeenCalledWith({
      submissionMode: "submit_and_capture_pdf",
      filingOperation: "submit_prepared",
    });
  });

  it("cancels without starting a run", async () => {
    const onStart = await openPreparedDialog();
    fireEvent.click(screen.getByRole("button", { name: "Keep reviewing" }));
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe("notice of assessment in the submit confirmation", () => {
  async function openDialog(menuItem: RegExp, noticeOfAssessmentLabel: string | null) {
    renderToolbar(vi.fn(), { noticeOfAssessmentLabel });
    fireEvent.keyDown(screen.getByRole("button", { name: /More/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: menuItem }));
    return screen.findByRole("alertdialog");
  }

  it.each([/Submit prepared/, /Submit return \+ save PDF/])(
    "shows the answer the submit will select (%s)",
    async (menuItem) => {
      const dialog = await openDialog(menuItem, "Yes (default)");
      expect(dialog).toHaveTextContent("Notice of assessment: Yes (default)");
    },
  );

  it("shows a reviewer's No", async () => {
    const dialog = await openDialog(/Submit prepared/, "No");
    expect(dialog).toHaveTextContent("Notice of assessment: No");
  });

  it("is omitted when it does not apply", async () => {
    const dialog = await openDialog(/Submit prepared/, null);
    expect(dialog).not.toHaveTextContent("Notice of assessment");
  });
});

describe("submit readiness from the server", () => {
  const ready = { ready: true, blocker: null };
  const PREPARE_AGAIN =
    "The latest preparation did not finish on the review page. Run Prepare only again, then submit the new draft.";

  async function openMenu(
    submitReadiness: ToolbarSubmitReadiness | null,
    onActionsMenuOpen = vi.fn(),
  ) {
    const onStart = renderToolbar(vi.fn(), { submitReadiness, onActionsMenuOpen });
    fireEvent.keyDown(screen.getByRole("button", { name: /More/ }), { key: "Enter" });
    await screen.findByRole("menuitem", { name: /Submit prepared/ });
    return { onStart, onActionsMenuOpen };
  }

  it("disables Submit prepared return and shows the server's reason", async () => {
    const { onStart } = await openMenu({
      submit: ready,
      submitPrepared: { ready: false, blocker: PREPARE_AGAIN },
    });
    const prepared = screen.getByRole("menuitem", { name: /Submit prepared/ });
    expect(prepared).toHaveAttribute("aria-disabled", "true");
    expect(prepared).toHaveAccessibleDescription(PREPARE_AGAIN);
    expect(screen.getByText(PREPARE_AGAIN)).toBeInTheDocument();

    fireEvent.click(prepared);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onStart).not.toHaveBeenCalled();

    // The full submit is not blocked by a missing prepared draft.
    const submit = screen.getByRole("menuitem", { name: /Submit return \+ save PDF/ });
    expect(submit).not.toHaveAttribute("aria-disabled");
    fireEvent.click(submit);
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("disables the full submit actions with their own reason", async () => {
    const blocker = "The client has not signed off this return.";
    await openMenu({ submit: { ready: false, blocker }, submitPrepared: ready });
    for (const name of [/Submit return \+ save PDF/, /Refill answers \+/]) {
      const item = screen.getByRole("menuitem", { name });
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveAccessibleDescription(blocker);
      fireEvent.click(item);
    }
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Submit prepared/ }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("shows a reason shared by every submit action once", async () => {
    const blocker = "This return is already completed.";
    await openMenu({
      submit: { ready: false, blocker },
      submitPrepared: { ready: false, blocker },
    });
    expect(screen.getAllByText(blocker)).toHaveLength(1);
    expect(
      screen.getByRole("menuitem", { name: /Submit prepared/ }),
    ).toHaveAccessibleDescription(blocker);
  });

  it("keeps Prepare only available whatever the submit readiness", async () => {
    await openMenu({
      submit: { ready: false, blocker: "x" },
      submitPrepared: { ready: false, blocker: "y" },
    });
    expect(
      screen.getByRole("menuitem", { name: /Refill saved answers/ }),
    ).not.toHaveAttribute("aria-disabled");
    // The open menu hides the rest of the toolbar from the accessibility tree.
    expect(
      screen.getByRole("button", { name: "Prepare only", hidden: true }),
    ).toBeEnabled();
  });

  it("leaves the actions enabled when readiness is unknown", async () => {
    await openMenu(null);
    for (const name of [/Submit prepared/, /Submit return \+ save PDF/, /Refill answers \+/]) {
      expect(screen.getByRole("menuitem", { name })).not.toHaveAttribute("aria-disabled");
    }
  });

  it("refreshes readiness when the menu opens", async () => {
    const { onActionsMenuOpen } = await openMenu(null);
    expect(onActionsMenuOpen).toHaveBeenCalledTimes(1);
  });
});

describe("readiness changing while the confirmation is open", () => {
  it("disables the final Submit and says why", async () => {
    const onStart = vi.fn();
    const toolbar = (submitReadiness: ToolbarSubmitReadiness) => (
      <TooltipProvider><BrowserToolbar
        orgId="org" jurisdictionName="Guernsey" entityName="Example Entity"
        taskStatus="pending" isConnected={false} liveUrl={null}
        iframeRef={{ current: null }} allJobs={[]} selectedJobId={null} selectedJob={null}
        activeJob={null} runningJob={null} pausedJob={null}
        onSelectJob={vi.fn()} onPause={vi.fn()} onCancel={vi.fn()} onResume={vi.fn()}
        onStart={onStart} onDeleteJob={vi.fn()}
        isStartPending={false} isPausePending={false} isCancelPending={false}
        isResumePending={false} isDeletePending={false}
        submitReadiness={submitReadiness}
      /></TooltipProvider>
    );
    const ready = { ready: true, blocker: null };
    const { rerender } = render(toolbar({ submit: ready, submitPrepared: ready }));
    fireEvent.keyDown(screen.getByRole("button", { name: /More/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Submit prepared/ }));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("checkbox"));

    const blocker = "Another run is active on this return.";
    rerender(toolbar({ submit: ready, submitPrepared: { ready: false, blocker } }));
    const submit = screen.getByRole("button", { name: "Submit prepared return" });
    expect(submit).toBeDisabled();
    expect(screen.getByText(`This submission cannot start: ${blocker}`)).toBeInTheDocument();
    fireEvent.click(submit);
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe("cancel control", () => {
  it("labels the icon-only Cancel task button for a queued run", () => {
    const onCancel = vi.fn();
    const queued = { id: "job-1", jobNumber: 2, status: "queued", createdAt: new Date() };
    render(<TooltipProvider><BrowserToolbar
      orgId="org" jurisdictionName="Guernsey" entityName="Example Entity"
      taskStatus="queued" isConnected={false} liveUrl={null}
      iframeRef={{ current: null }} allJobs={[queued] as never} selectedJobId="job-1" selectedJob={queued as never}
      activeJob={queued as never} runningJob={null} pausedJob={null}
      onSelectJob={vi.fn()} onPause={vi.fn()} onCancel={onCancel} onResume={vi.fn()}
      onStart={vi.fn()} onDeleteJob={vi.fn()}
      isStartPending={false} isPausePending={false} isCancelPending={false}
      isResumePending={false} isDeletePending={false}
    /></TooltipProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Cancel task" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("earlier submit runs without a receipt", () => {
  const ready = { ready: true, blocker: null };
  const caution =
    "Run #3 reached the portal and saved no receipt. This run first checks the portal shows the return as not yet submitted.";

  async function openDialog(menuItem: RegExp, submitReadiness: ToolbarSubmitReadiness) {
    const onStart = renderToolbar(vi.fn(), { submitReadiness });
    fireEvent.keyDown(screen.getByRole("button", { name: /More/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: menuItem }));
    return { onStart, dialog: await screen.findByRole("alertdialog") };
  }

  it.each([/Submit prepared/, /Submit return \+ save PDF/])(
    "shows one caution line and still lets the submission start (%s)",
    async (menuItem) => {
      const { onStart, dialog } = await openDialog(menuItem, { submit: ready, submitPrepared: ready, caution });
      expect(screen.getAllByText(caution)).toHaveLength(1);
      expect(dialog).toHaveTextContent(caution);
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: /^Submit (prepared )?return$/ }));
      expect(onStart).toHaveBeenCalledTimes(1);
    },
  );

  it("shows no caution without earlier runs", async () => {
    const { dialog } = await openDialog(/Submit prepared/, { submit: ready, submitPrepared: ready, caution: null });
    expect(dialog).not.toHaveTextContent("saved no receipt");
  });

  it("has no submit lock indicator or menu item", async () => {
    renderToolbar(vi.fn(), { submitReadiness: { submit: ready, submitPrepared: ready, caution } });
    expect(screen.queryByRole("button", { name: "Submit locked" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: /More/ }), { key: "Enter" });
    await screen.findByRole("menuitem", { name: /Submit prepared/ });
    expect(screen.queryByRole("menuitem", { name: /submit lock/i })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Submit prepared/ })).not.toHaveAttribute("aria-disabled");
  });
});
