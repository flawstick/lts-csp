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
  it("shows the server's reason until dismissed", () => {
    const onDismiss = vi.fn();
    const message =
      "The latest preparation did not finish on the review page. Run Prepare only again, then submit the new draft.";
    render(
      <StartErrorAlert
        error={{ action: "Submit prepared return", message }}
        onDismiss={onDismiss}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Submit prepared return did not start");
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent("No new run was created");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
