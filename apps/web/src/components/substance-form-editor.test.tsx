import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GUERNSEY_FORM_EDIT_RESIGNOFF_WARNING } from "@repo/database/guernsey-filing";
import { SubstanceFormEditor } from "./substance-form-editor";

beforeAll(() => {
  // Radix Select needs these in jsdom.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

function renderEditor(props: {
  noticeOfAssessment: "Yes" | "No" | null | undefined;
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

const noticeTrigger = () =>
  screen.getByRole("combobox", { name: "Receive a notice of assessment?" });

describe("SubstanceFormEditor notice of assessment", () => {
  it.each([null, undefined])("shows an unset answer (%j) as Yes (default)", (noticeOfAssessment) => {
    renderEditor({ noticeOfAssessment });
    expect(noticeTrigger()).toHaveTextContent("Yes (default)");
    expect(screen.queryByText(/required before/i)).toBeNull();
  });

  it("offers only Yes and No", async () => {
    renderEditor({ noticeOfAssessment: null });
    fireEvent.keyDown(noticeTrigger(), { key: "Enter" });
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Yes", "No"]);
  });

  it("shows a saved answer without the default label", () => {
    renderEditor({ noticeOfAssessment: "No" });
    expect(noticeTrigger()).toHaveTextContent("No");
    expect(noticeTrigger()).not.toHaveTextContent("default");
  });

  it("saves a switch from the default to No", async () => {
    const { onSave } = renderEditor({ noticeOfAssessment: null });
    await chooseNoticeOfAssessment("No");
    expect(noticeTrigger()).toHaveTextContent("No");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ noticeOfAssessment: "No" }));
  });

  it("treats switching to No and back to Yes as no change", async () => {
    const { onSave } = renderEditor({ noticeOfAssessment: null, isClientSignedOff: true });
    await chooseNoticeOfAssessment("No");
    await chooseNoticeOfAssessment("Yes");
    expect(noticeTrigger()).toHaveTextContent("Yes (default)");
    // Nothing to save, so the client's sign-off is not at risk.
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
  });

  it("can switch a saved No back to Yes", async () => {
    const { onSave } = renderEditor({ noticeOfAssessment: "No" });
    await chooseNoticeOfAssessment("Yes");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ noticeOfAssessment: "Yes" }));
  });

  it("warns before a save clears the client's sign-off", async () => {
    renderEditor({ noticeOfAssessment: null, isClientSignedOff: true });
    expect(screen.getByRole("note")).toHaveTextContent(GUERNSEY_FORM_EDIT_RESIGNOFF_WARNING);
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
