import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getLockingRuns,
  SubmitLockDialog,
  type SubmitDispatchLock,
  type SubmitLockRun,
} from "./submit-lock-dialog";

const BLOCKER =
  "An earlier Submit prepared return run reached the portal and did not save a filed-return receipt, so the portal may have accepted the filing.";
const STOPPED_AT = Date.UTC(2026, 10, 25, 14, 0);

function makeRun(overrides: Partial<SubmitLockRun> = {}): SubmitLockRun {
  return {
    jobId: "job-1",
    taskId: "task-1",
    jobNumber: 3,
    status: "failed",
    createdAt: new Date(STOPPED_AT - 60_000),
    completedAt: new Date(STOPPED_AT - 30_000),
    dispatchedAt: STOPPED_AT - 45_000,
    agentReport: {
      output: "PREPARED_DRAFT_NOT_VERIFIED: the draft changed",
      question: null,
      error: null,
    },
    receiptCaptureStatus: null,
    confirmation: null,
    hasBrowserSession: true,
    browserStop: null,
    stopRefusal: null,
    confirmRefusal: null,
    ...overrides,
  } as SubmitLockRun;
}

function makeLock(runs: SubmitLockRun[]): SubmitDispatchLock {
  return {
    blocker: runs.some((run) => !run.confirmation) ? BLOCKER : null,
    runs,
    noteMinLength: 10,
    noteMaxLength: 500,
    quietPeriodMinutes: 5,
    unverifiedQuietPeriodHours: 24,
  } as SubmitDispatchLock;
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof SubmitLockDialog>> = {},
) {
  const all = {
    taskId: "task-1",
    lock: makeLock([makeRun()]),
    open: true,
    onOpenChange: vi.fn(),
    onSelectJob: vi.fn(),
    onStopBrowser: vi.fn(),
    stoppingJobId: null,
    isStopPending: false,
    onRecordNotSubmitted: vi.fn().mockResolvedValue(undefined),
    isRecordPending: false,
    ...props,
  };
  const view = render(<SubmitLockDialog {...all} />);
  return {
    ...all,
    rerender: (next: Partial<typeof all>) =>
      view.rerender(<SubmitLockDialog {...all} {...next} />),
  };
}

describe("getLockingRuns", () => {
  it("lists only unconfirmed runs while the return is locked", () => {
    const open = makeRun({ jobId: "a" });
    const confirmed = makeRun({
      jobId: "b",
      confirmation: { confirmedAt: 1 } as never,
    });
    expect(getLockingRuns(makeLock([open, confirmed]))).toEqual([open]);
    expect(getLockingRuns(makeLock([confirmed]))).toEqual([]);
    expect(getLockingRuns(undefined)).toEqual([]);
  });
});

describe("SubmitLockDialog overview", () => {
  it("explains the lock and lists each locking run", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", {
      name: "Submitting is locked for this return",
    });
    expect(dialog).toHaveAccessibleDescription(BLOCKER);
    expect(
      screen.getByRole("heading", { name: "Submit prepared return, run #3" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("failed · reached the portal");
    expect(screen.getByRole("button", { name: "Stop browser" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /I checked the portal: not submitted/ }),
    ).toBeEnabled();
  });

  it("renders nothing when closed or not locked", () => {
    const { rerender } = renderDialog({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender({ open: true, lock: makeLock([]) });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes itself once the lock is lifted", async () => {
    const { rerender, onOpenChange } = renderDialog();
    rerender({ lock: makeLock([]) });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("keeps the agent report collapsed until asked for", () => {
    renderDialog();
    expect(
      screen.queryByText(/PREPARED_DRAFT_NOT_VERIFIED/),
    ).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show agent report" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText(/PREPARED_DRAFT_NOT_VERIFIED/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide agent report" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("says when the run recorded no report", () => {
    renderDialog({
      lock: makeLock([
        makeRun({ agentReport: { output: null, question: null, error: null } }),
      ]),
    });
    expect(screen.getByText("The run recorded no report.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show agent report" }),
    ).not.toBeInTheDocument();
  });

  it("stops the run's browser, unless refused", () => {
    const { onStopBrowser, rerender } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Stop browser" }));
    expect(onStopBrowser).toHaveBeenCalledWith("job-1");

    const refusal = "The run is still active. Cancel it first.";
    rerender({ lock: makeLock([makeRun({ stopRefusal: refusal })]) });
    expect(screen.getByRole("button", { name: "Stop browser" })).toBeDisabled();
    expect(screen.getByText(refusal)).toBeInTheDocument();
  });

  it("explains the longer wait when the run has no browser session", () => {
    renderDialog({ lock: makeLock([makeRun({ hasBrowserSession: false })]) });
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "recorded no browser session",
    );
    expect(
      screen.queryByRole("button", { name: /Stop browser/ }),
    ).not.toBeInTheDocument();
  });

  it("disables recording with the server's refusal", () => {
    const refusal = "Wait 5 minutes after the browser stopped.";
    renderDialog({ lock: makeLock([makeRun({ confirmRefusal: refusal })]) });
    expect(
      screen.getByRole("button", { name: /I checked the portal: not submitted/ }),
    ).toBeDisabled();
    expect(screen.getByText(refusal)).toBeInTheDocument();
  });

  it("selects the run and closes from Show run", () => {
    const { onSelectJob, onOpenChange } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Show run" }));
    expect(onSelectJob).toHaveBeenCalledWith("job-1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("offers no Show run for another task's run", () => {
    renderDialog({ lock: makeLock([makeRun({ taskId: "task-2" })]) });
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "(another task on this return)",
    );
    expect(
      screen.queryByRole("button", { name: "Show run" }),
    ).not.toBeInTheDocument();
  });
});

describe("SubmitLockDialog record not submitted view", () => {
  const stopped = makeRun({
    browserStop: {
      stoppedAt: STOPPED_AT,
      stoppedByName: "Staff Person",
      statusBefore: "stopped",
      statusAfter: "stopped",
      verified: true,
      wasActive: false,
    },
  });

  function openForm(props: Parameters<typeof renderDialog>[0] = {}) {
    const result = renderDialog({ lock: makeLock([stopped]), ...props });
    fireEvent.click(
      screen.getByRole("button", { name: /I checked the portal: not submitted/ }),
    );
    return result;
  }

  it("replaces the overview inside the same dialog", () => {
    openForm();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.getByRole("dialog", { name: "Record that run #3 did not submit?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("dialog", { name: "Submitting is locked for this return" }),
    ).toBeInTheDocument();
  });

  it("needs the box ticked and a long enough note", async () => {
    const { onRecordNotSubmitted } = openForm();
    const record = screen.getByRole("button", { name: "Record not submitted" });
    expect(record).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(record).toBeDisabled();
    const note = screen.getByRole("textbox", {
      name: "What the portal shows for this return",
    });
    expect(note).toHaveAttribute("maxLength", "500");
    fireEvent.change(note, { target: { value: "  too short  " } });
    expect(record).toBeDisabled();
    fireEvent.change(note, {
      target: { value: "  Still a draft on the portal; no receipt.  " },
    });
    expect(record).toBeEnabled();
    fireEvent.click(record);
    expect(onRecordNotSubmitted).toHaveBeenCalledWith({
      jobId: "job-1",
      checkedAfterBrowserStoppedAt: STOPPED_AT,
      note: "Still a draft on the portal; no receipt.",
    });
    // Back on the overview once recorded.
    expect(
      await screen.findByRole("dialog", {
        name: "Submitting is locked for this return",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the form filled in when the server refuses", async () => {
    const onRecordNotSubmitted = vi.fn().mockRejectedValue(new Error("no"));
    openForm({ onRecordNotSubmitted });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Still a draft on the portal." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record not submitted" }));
    await waitFor(() => expect(onRecordNotSubmitted).toHaveBeenCalled());
    expect(screen.getByRole("textbox")).toHaveValue("Still a draft on the portal.");
    expect(
      screen.getByRole("dialog", { name: "Record that run #3 did not submit?" }),
    ).toBeInTheDocument();
  });

  it("shows a refusal that appears while the form is open", () => {
    const { rerender } = openForm();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Still a draft on the portal." },
    });
    const refusal = "Another run is active on this return.";
    rerender({
      lock: makeLock([{ ...stopped, confirmRefusal: refusal }]),
    });
    expect(screen.getByRole("alert")).toHaveTextContent(refusal);
    expect(
      screen.getByRole("button", { name: "Record not submitted" }),
    ).toBeDisabled();
  });

  it("cannot be closed or left while recording", () => {
    const { rerender, onOpenChange } = openForm();
    rerender({ isRecordPending: true });
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Record not submitted" }),
    ).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("uses the time the browser was stopped in the confirmation", () => {
    openForm();
    const label = new Date(STOPPED_AT).toLocaleString();
    expect(
      screen.getByRole("checkbox", {
        name: `I checked the Guernsey Tax Portal after ${label}. This return was NOT submitted.`,
      }),
    ).toBeInTheDocument();
  });
});
