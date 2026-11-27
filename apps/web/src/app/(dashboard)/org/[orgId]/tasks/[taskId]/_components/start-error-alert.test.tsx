import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { describeStartAction, StartErrorAlert } from "./start-error-alert";

describe("describeStartAction", () => {
  it("names each start request as the toolbar does", () => {
    expect(
      describeStartAction({
        submissionMode: "submit_and_capture_pdf",
        filingOperation: "submit_prepared",
      }),
    ).toBe("Submit prepared return");
    expect(describeStartAction({ submissionMode: "submit_and_capture_pdf" })).toBe(
      "Submit return",
    );
    expect(
      describeStartAction({ submissionMode: "submit_and_capture_pdf", overrideSaved: true }),
    ).toBe("Refill answers + submit");
    expect(describeStartAction({ submissionMode: "prepare_only" })).toBe("Prepare only");
    expect(describeStartAction({ overrideSaved: true })).toBe("Refill saved answers");
  });
});

describe("StartErrorAlert", () => {
  const message =
    "The latest preparation did not finish on the review page. Run Prepare only again, then submit the new draft.";

  function renderAlert(onDismiss = vi.fn()) {
    render(
      <StartErrorAlert
        error={{ action: "Submit prepared return", message }}
        onDismiss={onDismiss}
      />,
    );
    return onDismiss;
  }

  it("shows the server's reason in a dialog until dismissed with OK", () => {
    const onDismiss = renderAlert();
    const dialog = screen.getByRole("alertdialog", {
      name: "Submit prepared return did not start",
    });
    expect(dialog).toHaveAccessibleDescription(message);
    expect(dialog).toHaveTextContent("No new run was created");
    // A single action closes it.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("is dismissed with Escape", () => {
    const onDismiss = renderAlert();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
