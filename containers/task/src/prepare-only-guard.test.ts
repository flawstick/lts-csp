// @vitest-environment jsdom
/// <reference lib="dom" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const guardDir = resolve(__dirname, "../prepare-only-guard");
const load = (file: string) =>
  // Content scripts are plain scripts that attach to globalThis.
  new Function(readFileSync(resolve(guardDir, file), "utf8"))();

type Guard = {
  isFinalSubmitLabel(text: string): boolean;
  shouldBlockRequest(method: string, url: string): boolean;
  BLOCK_MESSAGE: string;
};

const pageFetch = vi.fn(async () => new Response("ok"));

let guard: Guard;

beforeAll(() => {
  // The page's own fetch, which the MAIN-world script wraps at load.
  globalThis.fetch = pageFetch as unknown as typeof fetch;
  load("guard-core.js");
  load("guard-isolated.js");
  load("guard-main.js");
  guard = (globalThis as unknown as { __LTS_PREPARE_ONLY_GUARD__: Guard })
    .__LTS_PREPARE_ONLY_GUARD__;
});

beforeEach(() => {
  history.replaceState(null, "", "/company-tax-ui/company-tax/tax-returns/abc/entityInformation");
  pageFetch.mockClear();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-lts-prepare-only-blocks");
  document.documentElement.removeAttribute("data-lts-prepare-only-blocked");
});

describe("prepare-only guard labels", () => {
  it.each([
    "Submit",
    "  submit  ",
    "Submit return",
    "Submit the declaration",
    "Confirm and submit",
    "Declare & submit",
    "Accept and submit return",
    "File tax return",
    "Submit now",
    // Actual final action on the Guernsey Revenue Service company-tax-ui.
    "Complete submission to Revenue Service",
    "Complete submission to Revenue Service >",
    "  COMPLETE SUBMISSION TO REVENUE SERVICE  ",
    "Complete submission",
    "Confirm submission",
    "Finalise submission",
    "Submit to Revenue Service",
    "Submit tax return to Revenue Service",
  ])("blocks final action %j", (label) => {
    expect(guard.isFinalSubmitLabel(label)).toBe(true);
  });

  it.each([
    "Save",
    "Save and continue",
    "Continue",
    "Next",
    "Prepare",
    "Go to tax return",
    "Change",
    "Submit a query",
    "Upload",
    "Review and submit",
    "Submit an enquiry",
    "Save and complete later",
    "Entity Information",
    "Notice of assessment",
  ])("allows preparation control %j", (label) => {
    expect(guard.isFinalSubmitLabel(label)).toBe(false);
  });
});

describe("prepare-only guard DOM enforcement", () => {
  function renderForm(buttonLabel: string) {
    document.body.innerHTML = `
      <form id="f" action="/submit">
        <input id="field" name="x" />
        <button id="b" type="submit"><span id="inner">${buttonLabel}</span></button>
      </form>`;
    const form = document.getElementById("f") as HTMLFormElement;
    const pageHandler = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", pageHandler);
    const clickHandler = vi.fn();
    document.getElementById("b")!.addEventListener("click", clickHandler);
    return { form, pageHandler, clickHandler };
  }

  it("stops a click on the final Submit button before page handlers and submission", () => {
    const { pageHandler, clickHandler } = renderForm("Submit");
    document.getElementById("inner")!.click();
    expect(clickHandler).not.toHaveBeenCalled();
    expect(pageHandler).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.ltsPrepareOnlyBlocks).toBe("1");
    expect(document.body.textContent).toContain("READY_FOR_MANUAL_SUBMISSION");
  });

  it("stops script submission paths (requestSubmit and submit())", () => {
    const { form, pageHandler } = renderForm("Confirm and submit");
    form.requestSubmit(document.getElementById("b") as HTMLButtonElement);
    form.requestSubmit();
    form.submit();
    expect(pageHandler).not.toHaveBeenCalled();
    expect(Number(document.documentElement.dataset.ltsPrepareOnlyBlocks)).toBe(3);
  });

  it("stops implicit Enter submission from a field in a final-submit form", () => {
    renderForm("Submit");
    const field = document.getElementById("field")!;
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets section saves through untouched", () => {
    const { pageHandler, clickHandler } = renderForm("Save and continue");
    document.getElementById("b")!.click();
    expect(clickHandler).toHaveBeenCalledTimes(1);
    expect(pageHandler).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.ltsPrepareOnlyBlocks).toBeUndefined();
  });
});

describe("prepare-only guard on the real final action", () => {
  it("stops a click on 'Complete submission to Revenue Service'", () => {
    document.body.innerHTML = `<button id="b" type="button">Complete submission to Revenue Service</button>`;
    const handler = vi.fn();
    document.getElementById("b")!.addEventListener("click", handler);
    document.getElementById("b")!.click();
    expect(handler).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.ltsPrepareOnlyBlocks).toBe("1");
  });
});

describe("prepare-only guard network layer (fail closed on final page)", () => {
  const finalPage = "/company-tax-ui/company-tax/tax-returns/abc/reviewAndSubmit/summary";

  it("allows draft saves and reads away from the final page", async () => {
    await fetch("/company-tax-api/v1/taxReturn/abc/entityInformation", { method: "PUT" });
    await fetch("/company-tax-api/v1/submittedTaxReturn/abc/taxReturnPdf");
    expect(pageFetch).toHaveBeenCalledTimes(2);
    expect(document.documentElement.dataset.ltsPrepareOnlyBlocks).toBeUndefined();
  });

  it("blocks mutating submit-like API calls anywhere", async () => {
    await expect(
      fetch("https://revenueservice.gov.gg/company-tax-api/v1/taxReturn/abc/submit", { method: "POST" }),
    ).rejects.toThrow(/PREPARE-ONLY GUARD/);
    expect(pageFetch).not.toHaveBeenCalled();
    expect(guard.shouldBlockRequest("GET", "/company-tax-api/v1/submittedTaxReturn/abc/taxReturnPdf")).toBe(false);
  });

  it("blocks every mutating fetch/XHR from the final review page", async () => {
    history.replaceState(null, "", finalPage);
    await expect(
      fetch("/company-tax-api/v1/taxReturn/abc", { method: "PATCH" }),
    ).rejects.toThrow(/PREPARE-ONLY GUARD/);
    await expect(
      fetch(new Request("http://localhost/company-tax-api/v1/x", { method: "POST" })),
    ).rejects.toThrow(/PREPARE-ONLY GUARD/);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/company-tax-api/v1/taxReturn/abc/complete");
    expect(() => xhr.send("{}")).toThrow(/PREPARE-ONLY GUARD/);
    expect(pageFetch).not.toHaveBeenCalled();
    // Reads (e.g. Change links, summary data) still work.
    await fetch("/company-tax-api/v1/taxReturn/abc");
    expect(pageFetch).toHaveBeenCalledTimes(1);
    expect(Number(document.documentElement.dataset.ltsPrepareOnlyBlocks)).toBe(3);
  });

  it("blocks POST form submission from the final review page whatever the label", () => {
    history.replaceState(null, "", finalPage);
    document.body.innerHTML = `
      <form id="f" method="post" action="/x"><button id="b" type="submit">Continue</button></form>`;
    const form = document.getElementById("f") as HTMLFormElement;
    const pageHandler = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", pageHandler);
    document.getElementById("b")!.click();
    form.submit();
    expect(pageHandler).not.toHaveBeenCalled();
    expect(Number(document.documentElement.dataset.ltsPrepareOnlyBlocks)).toBe(2);
  });
});

describe("prepare-only guard: verified GRS endpoints", () => {
  const api = "https://revenueservice.gov.gg/company-tax-api/v1";
  const submit = `${api}/draftTaxReturn/d9caade1-200a-4d67-ab12-a91e9c8b75f3/submitDeclaration`;
  const pdfs = [
    `${api}/submittedTaxReturn/d9caade1/taxReturnPdf`,
    `${api}/draftTaxReturn/d9caade1/review/completedTaxReturnPdf`,
    `${api}/draftTaxReturn/d9caade1/review/incompleteTaxReturnPdf`,
  ];

  it("blocks POST submitDeclaration in page scripts on any route", async () => {
    expect(guard.shouldBlockRequest("POST", submit)).toBe(true);
    await expect(fetch(submit, { method: "POST" })).rejects.toThrow(/PREPARE-ONLY GUARD/);
    expect(pageFetch).not.toHaveBeenCalled();
  });

  it("allows the PDF POSTs, including from the final review page", async () => {
    history.replaceState(null, "", "/company-tax-ui/company-tax/tax-returns/abc/reviewAndSubmit/summary");
    for (const url of pdfs) {
      expect(guard.shouldBlockRequest("POST", url)).toBe(false);
      await fetch(url, { method: "POST" });
    }
    expect(pageFetch).toHaveBeenCalledTimes(pdfs.length);
  });

  describe("declarativeNetRequest rules (network layer)", () => {
    const manifest = JSON.parse(readFileSync(resolve(guardDir, "manifest.json"), "utf8"));
    const rules: Array<{
      action: { type: string };
      condition: { regexFilter: string; requestMethods?: string[] };
    }> = JSON.parse(readFileSync(resolve(guardDir, "rules.json"), "utf8"));
    const blocks = (url: string, method = "post") =>
      rules.some(
        (rule) =>
          rule.action.type === "block" &&
          new RegExp(rule.condition.regexFilter, "i").test(url) &&
          (!rule.condition.requestMethods || rule.condition.requestMethods.includes(method)),
      );

    it("is registered in the manifest with the needed permission", () => {
      expect(manifest.permissions).toContain("declarativeNetRequest");
      expect(manifest.declarative_net_request.rule_resources).toEqual([
        expect.objectContaining({ enabled: true, path: "rules.json" }),
      ]);
    });

    it("blocks the exact submitDeclaration endpoint", () => {
      expect(blocks(submit)).toBe(true);
      expect(blocks(`${submit}?x=1`)).toBe(true);
      expect(blocks(submit.replace("submitDeclaration", "SubmitDeclaration"))).toBe(true);
    });

    it("does not block PDFs, draft saves or other hosts", () => {
      for (const url of pdfs) expect(blocks(url)).toBe(false);
      expect(blocks(`${api}/draftTaxReturn/abc/entityInformation`, "put")).toBe(false);
      expect(blocks("https://revenueservice.gov.gg.evil.example/company-tax-api/v1/draftTaxReturn/a/submitDeclaration")).toBe(false);
    });
  });
});
