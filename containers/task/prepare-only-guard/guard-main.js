/*
 * MAIN-world patches for paths that fire no submit event: script calls to
 * form.submit() / form.requestSubmit(finalButton) and finalButton.click()
 * (the latter does dispatch a click, which the isolated listener also stops),
 * plus page-script fetch/XHR/sendBeacon requests that could carry the filing.
 */
(function (root) {
  "use strict";
  var guard = root.__LTS_PREPARE_ONLY_GUARD__;
  if (!guard || !root.HTMLFormElement || root.__LTS_PREPARE_ONLY_GUARD_PATCHED__) return;
  root.__LTS_PREPARE_ONLY_GUARD_PATCHED__ = true;
  var proto = root.HTMLFormElement.prototype;
  var nativeSubmit = proto.submit;
  var nativeRequestSubmit = proto.requestSubmit;

  proto.submit = function () {
    if (guard.isFinalSubmitForm(this)) {
      guard.recordBlock(root.document, "form.submit()");
      return;
    }
    return nativeSubmit.apply(this, arguments);
  };

  // form.submit() fires no submit event: apply the final-page POST rule here.
  var guardedSubmit = proto.submit;
  proto.submit = function () {
    var method = (this.getAttribute && this.getAttribute("method")) || "GET";
    if (guard.isFinalPage() && guard.isMutatingMethod(method)) {
      guard.recordBlock(root.document, "form.submit() POST from final review page");
      return;
    }
    return guardedSubmit.apply(this, arguments);
  };

  if (nativeRequestSubmit) {
    proto.requestSubmit = function (submitter) {
      if (submitter ? guard.findFinalSubmitControl(submitter) : guard.isFinalSubmitForm(this)) {
        guard.recordBlock(root.document, "form.requestSubmit()");
        return;
      }
      return nativeRequestSubmit.apply(this, arguments);
    };
  }

  // Network layer (in-page): mutating fetch/XHR/sendBeacon calls that could
  // carry the filing. Only requests made by page scripts are covered; see
  // src/prepare-only-guard.ts for the limits.
  function blockedError(what) {
    guard.recordBlock(root.document, what);
    return new root.TypeError(guard.BLOCK_MESSAGE);
  }

  if (root.fetch) {
    var nativeFetch = root.fetch;
    root.fetch = function (input, init) {
      var method = (init && init.method) || (input && typeof input === "object" && input.method) || "GET";
      var url = input && typeof input === "object" && "url" in input ? input.url : input;
      if (guard.shouldBlockRequest(method, url)) {
        return Promise.reject(blockedError("fetch " + String(method).toUpperCase()));
      }
      return nativeFetch.apply(this, arguments);
    };
  }

  if (root.XMLHttpRequest) {
    var xhrProto = root.XMLHttpRequest.prototype;
    var nativeOpen = xhrProto.open;
    var nativeSend = xhrProto.send;
    xhrProto.open = function (method, url) {
      this.__ltsGuardRequest = { method: method, url: url };
      return nativeOpen.apply(this, arguments);
    };
    xhrProto.send = function () {
      var request = this.__ltsGuardRequest;
      if (request && guard.shouldBlockRequest(request.method, request.url)) {
        throw blockedError("XMLHttpRequest " + String(request.method).toUpperCase());
      }
      return nativeSend.apply(this, arguments);
    };
  }

  if (root.navigator && root.navigator.sendBeacon) {
    var nativeBeacon = root.navigator.sendBeacon.bind(root.navigator);
    root.navigator.sendBeacon = function (url, data) {
      if (guard.shouldBlockRequest("POST", url)) {
        blockedError("sendBeacon");
        return false;
      }
      return nativeBeacon(url, data);
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
