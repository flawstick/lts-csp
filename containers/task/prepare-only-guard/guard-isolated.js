/*
 * Isolated-world listeners. DOM events are shared with the page, so capture
 * listeners registered at document_start on window run before page handlers
 * and stop trusted (CDP-dispatched) clicks, Enter/Space activation and native
 * form submission through a final-submit control.
 */
(function (root) {
  "use strict";
  var guard = root.__LTS_PREPARE_ONLY_GUARD__;
  if (!guard || root.__LTS_PREPARE_ONLY_GUARD_LISTENING__) return;
  root.__LTS_PREPARE_ONLY_GUARD_LISTENING__ = true;
  var doc = root.document;

  function block(event, label) {
    event.preventDefault();
    event.stopImmediatePropagation();
    guard.recordBlock(doc, label);
  }

  ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick"].forEach(
    function (type) {
      root.addEventListener(
        type,
        function (event) {
          var control = guard.findFinalSubmitControl(event.target);
          if (control) block(event, guard.controlLabel(control));
        },
        true,
      );
    },
  );

  root.addEventListener(
    "keydown",
    function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      var target = event.target;
      var control = guard.findFinalSubmitControl(target);
      if (control) return block(event, guard.controlLabel(control));
      // Enter inside a form field triggers implicit submission.
      if (event.key === "Enter" && target && target.form && guard.isFinalSubmitForm(target.form)) {
        block(event, "implicit form submission");
      }
    },
    true,
  );

  root.addEventListener(
    "submit",
    function (event) {
      var submitter = event.submitter;
      if (submitter ? guard.findFinalSubmitControl(submitter) : guard.isFinalSubmitForm(event.target)) {
        return block(event, submitter ? guard.controlLabel(submitter) : "form submit");
      }
      // Fail closed on the final review page: no POST form leaves it.
      var form = event.target;
      var method = (submitter && submitter.getAttribute && submitter.getAttribute("formmethod")) ||
        (form && form.getAttribute && form.getAttribute("method")) || "GET";
      if (guard.isFinalPage() && guard.isMutatingMethod(method)) {
        block(event, "form POST from final review page");
      }
    },
    true,
  );
})(typeof globalThis !== "undefined" ? globalThis : this);
