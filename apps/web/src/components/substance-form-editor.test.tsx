import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GUERNSEY_NOTICE_OF_ASSESSMENT_RESIGNOFF_WARNING } from "@repo/database/guernsey-filing";
import { SubstanceFormEditor } from "./substance-form-editor";

beforeAll(() => {
  // Radix Select needs these in jsdom.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

function renderEditor(props: {
  noticeOfAssessment: "Yes" | "No" | null;
  isClientSignedOff?: boolean;
  onSave?: (data: unknown) => Promise<void>;
}) {
  const onSave = props.onSave ?? vi.fn(async () => {});
  render(
    <SubstanceFormEditor
      sectionId="additionalInformation"
      formData={{ noticeOfAssessment: props.noticeOfAssessment }}
      open
      onOpenChange={() => {}}
      onSave={onSave}
      isSaving={false}
      isClientSignedOff={props.isClientSignedOff}
    />,
  );
  return { onSave };
}

async function chooseNoticeOfAssessment(option: string) {
  const trigger = screen.getByRole("combobox", { name: "Receive a notice of assessment?" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  const item = await screen.findByRole("option", { name: option });
  fireEvent.click(item);
}

describe("SubstanceFormEditor notice of assessment", () => {
  it("can clear a saved answer back to not set", async () => {
    const { onSave } = renderEditor({ noticeOfAssessment: "Yes" });
    await chooseNoticeOfAssessment("Not set");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ noticeOfAssessment: null }));
  });

  it("warns before a save clears the client's sign-off", async () => {
    renderEditor({ noticeOfAssessment: null, isClientSignedOff: true });
    expect(screen.getByRole("note")).toHaveTextContent(
      GUERNSEY_NOTICE_OF_ASSESSMENT_RESIGNOFF_WARNING,
    );
    // No change yet: the ordinary label.
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    await chooseNoticeOfAssessment("No");
    expect(
      screen.getByRole("button", { name: "Save and clear client sign-off" }),
    ).toBeInTheDocument();
  });

  it("shows no sign-off warning when the client has not signed off", () => {
    renderEditor({ noticeOfAssessment: null });
    expect(screen.queryByRole("note")).toBeNull();
  });
});
