import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrowserToolbar } from "./browser-toolbar";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderToolbar(onStart = vi.fn()) {
  render(<TooltipProvider><BrowserToolbar
    orgId="org" jurisdictionName="Guernsey" entityName="Example Entity"
    taskStatus="pending" isConnected={false} liveUrl={null}
    iframeRef={{ current: null }} allJobs={[]} selectedJobId={null} selectedJob={null}
    isBrowserFullscreen={false} setIsBrowserFullscreen={vi.fn()}
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
      isBrowserFullscreen={false} setIsBrowserFullscreen={vi.fn()}
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
