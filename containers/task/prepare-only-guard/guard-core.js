/*
 * LTS prepare-only guard: shared logic for the isolated and MAIN worlds.
 * Plain script (MV3 content scripts are not modules); exposes one global.
 *
 * Scope: blocks activation of controls whose label is a FINAL filing action
 * ("Submit", "Confirm and submit", "Declare and submit", ...) and native form
 * submission through them. Section-level "Save", "Continue", "Next" and
 * "Save and continue" are deliberately allowed so the draft can be prepared.
 */
(function (root) {
  "use strict";
  if (root.__LTS_PREPARE_ONLY_GUARD__) return;

  var BANNER_ID = "lts-prepare-only-guard-banner";
  var BLOCK_MESSAGE =
    "LTS PREPARE-ONLY GUARD: final submission is blocked in this run. " +
    "Do not retry. Stop here and report READY_FOR_MANUAL_SUBMISSION.";

  // Final actions seen on the Guernsey Revenue Service portal include
  // "Complete submission to Revenue Service" (company-tax-ui
  // reviewAndSubmit/summary). Patterns err towards blocking.
  var FINAL_SUBMIT_PATTERNS = [
    /^submit\b/,
    /\bsubmi(t|ssion) to (the )?(guernsey )?revenue service\b/,
    /^(complete|confirm|finali[sz]e|make|send) (the |this |my |your |final )?(tax )?submission\b/,
    /^(confirm|accept|agree|declare|sign)( and | & )submit\b/,
    /^(file|send|lodge) (the |this |my )?(tax )?return$/,
    /^(make|submit) (the |a )?declaration$/,
  ];

  // "Submit ..." controls that do not file the return.
  var SAFE_SUBMIT_PATTERNS = [
    /^submit (a |an )?(query|enquiry|question|feedback|comment|message|request for help)s?$/,
  ];

  // Final review page of the company-tax-ui (prepare_only success state).
  // Any mutating request from it is blocked: the only mutation it offers is
  // the filing itself, and the exact submission endpoint is not verified.
  var FINAL_PAGE_PATTERN = /reviewandsubmit/i;

  function normalizeLabel(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[.!:>›»→]+$/g, "")
      .trim()
      .toLowerCase();
  }

  function isFinalSubmitLabel(text) {
    var label = normalizeLabel(text);
    if (!label) return false;
    for (var j = 0; j < SAFE_SUBMIT_PATTERNS.length; j++) {
      if (SAFE_SUBMIT_PATTERNS[j].test(label)) return false;
    }
    for (var i = 0; i < FINAL_SUBMIT_PATTERNS.length; i++) {
      if (FINAL_SUBMIT_PATTERNS[i].test(label)) return true;
    }
    return false;
  }

  function controlLabel(el) {
    if (!el || el.nodeType !== 1) return "";
    var tag = el.tagName.toLowerCase();
    if (tag === "input") {
      return el.value || el.getAttribute("aria-label") || "";
    }
    return (
      el.getAttribute("aria-label") ||
      el.textContent ||
      el.getAttribute("title") ||
      ""
    );
  }

  var CONTROL_SELECTOR =
    "button, input[type=submit], input[type=button], input[type=image], a, [role=button]";

  /** The final-submit control an event target belongs to, or null. */
  function findFinalSubmitControl(target) {
    var el = target && target.nodeType === 1 ? target : target && target.parentElement;
    var control = el && el.closest ? el.closest(CONTROL_SELECTOR) : null;
    if (!control) return null;
    return isFinalSubmitLabel(controlLabel(control)) ? control : null;
  }

  /** True when submitting this form (no explicit submitter) is a final filing. */
  function isFinalSubmitForm(form) {
    if (!form || !form.querySelectorAll) return false;
    var buttons = form.querySelectorAll(
      "button:not([type=button]):not([type=reset]), input[type=submit], input[type=image]",
    );
    if (!buttons.length) return false;
    // Implicit submission uses the first submit button.
    return isFinalSubmitLabel(controlLabel(buttons[0]));
  }

  function showBanner(doc) {
    try {
      doc.documentElement.setAttribute("data-lts-prepare-only-blocked", "true");
      if (doc.getElementById(BANNER_ID) || !doc.body) return;
      var banner = doc.createElement("div");
      banner.id = BANNER_ID;
      banner.setAttribute("role", "alert");
      banner.textContent = BLOCK_MESSAGE;
      banner.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px 16px;" +
        "background:#b91c1c;color:#fff;font:600 15px/1.4 system-ui,sans-serif;text-align:center";
      doc.body.appendChild(banner);
    } catch (e) {}
  }

  function recordBlock(doc, label) {
    try {
      var count = Number(doc.documentElement.getAttribute("data-lts-prepare-only-blocks") || "0") + 1;
      doc.documentElement.setAttribute("data-lts-prepare-only-blocks", String(count));
      if (root.console && root.console.warn) root.console.warn(BLOCK_MESSAGE + " (" + label + ")");
    } catch (e) {}
    showBanner(doc);
  }

  /** True when the page (or SPA route) is the final review/submit page. */
  function isFinalPage(href) {
    try {
      var url = String(href || (root.location && root.location.href) || "");
      return FINAL_PAGE_PATTERN.test(url);
    } catch (e) {
      return false;
    }
  }

  // Verified from the company-tax-ui bundle: "Complete submission to Revenue
  // Service" POSTs /company-tax-api/v1/draftTaxReturn/<id>/submitDeclaration.
  // Also blocked at the network layer by rules.json (declarativeNetRequest).
  // The generic /submit... rule is a fallback; "submitted..." paths are reads.
  var SUBMIT_API_PATTERN = /\/company-tax-api\/[^?#]*\/(submitDeclaration|submit(?!ted)[^/?#]*)([/?#]|$)/i;

  // PDF generation endpoints are POSTs but never file anything:
  //   /submittedTaxReturn/<id>/taxReturnPdf (official filed-return PDF),
  //   /draftTaxReturn/<id>/review/completedTaxReturnPdf and
  //   /draftTaxReturn/<id>/review/incompleteTaxReturnPdf (draft previews).
  var PDF_API_PATTERN = /\/company-tax-api\/[^?#]*\/(taxReturnPdf|completedTaxReturnPdf|incompleteTaxReturnPdf)([?#]|$)/i;

  function resolveUrl(url) {
    try {
      return new root.URL(String(url), root.location && root.location.href).href;
    } catch (e) {
      return String(url || "");
    }
  }

  /** Whether a request must be blocked in a prepare-only run. */
  function shouldBlockRequest(method, url) {
    if (!isMutatingMethod(method)) return false;
    var href = resolveUrl(url);
    if (SUBMIT_API_PATTERN.test(href)) return true;
    if (PDF_API_PATTERN.test(href)) return false;
    return isFinalPage();
  }

  function isMutatingMethod(method) {
    var m = String(method || "GET").toUpperCase();
    return m !== "GET" && m !== "HEAD" && m !== "OPTIONS";
  }

  root.__LTS_PREPARE_ONLY_GUARD__ = {
    isFinalPage: isFinalPage,
    isMutatingMethod: isMutatingMethod,
    shouldBlockRequest: shouldBlockRequest,
    BLOCK_MESSAGE: BLOCK_MESSAGE,
    isFinalSubmitLabel: isFinalSubmitLabel,
    findFinalSubmitControl: findFinalSubmitControl,
    isFinalSubmitForm: isFinalSubmitForm,
    controlLabel: controlLabel,
    recordBlock: recordBlock,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
