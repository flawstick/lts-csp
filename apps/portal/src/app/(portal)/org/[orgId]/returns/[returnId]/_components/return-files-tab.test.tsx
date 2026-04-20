import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Tabs } from "@/components/ui/tabs";

import { ReturnFilesTab } from "./return-files-tab";

describe("ReturnFilesTab", () => {
  it("renders the reduced certificate 2 document flow without AI extraction or financial-statement requirements", () => {
    render(
      <Tabs defaultValue="files">
        <ReturnFilesTab
          selectedReturnId="return-1"
          selectedFiles={[]}
          hasFinancialStatements={false}
          requireFinancialStatements={false}
          isUploading={false}
          isExtractPending={false}
          isAssignPending={false}
          uploadedFileUrls={null}
          showAiExtraction={false}
          uploadDescription="Certificate 2 uploads do not require accounts."
          uploadedFilesDescription="Reduced certificate 2 document flow."
          onUploadFiles={() => {}}
          onAssignFinancialStatements={() => {}}
          onDismissAssignment={() => {}}
          onRunAiExtraction={() => {}}
          onRemoveDocument={() => {}}
          onUnassignFinancialStatements={() => {}}
        />
      </Tabs>,
    );

    expect(
      screen.getByText("Certificate 2 uploads do not require accounts."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reduced certificate 2 document flow."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /run ai extraction/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/select one pdf as the financial statements/i),
    ).not.toBeInTheDocument();
  });
});
