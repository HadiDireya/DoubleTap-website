// DoubleTap checkout — vanilla JS, two pages:
//   buy.html     → POST /lahza/init, redirect browser to Lahza's hosted
//                  checkout. Card entry happens on checkout.lahza.io.
//   success.html → callback target after Lahza's checkout. Polls
//                  /lahza/key for the freshly-issued license, shows it.
// Override the API base for local dev: window.DT_API_BASE = "http://127.0.0.1:8787"
(function () {
  "use strict";

  // Dev convenience: when served from localhost, auto-target the local
  // Worker (`wrangler dev` defaults to 127.0.0.1:8787). Override either
  // axis with window.DT_API_BASE before this script runs.
  var isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  var API_BASE = window.DT_API_BASE
    || (isLocal ? "http://127.0.0.1:8787" : "https://doubletap-license.hadidireya.workers.dev");

  // ---------- buy.html ----------
  var payBtn = document.getElementById("pay-lahza");
  if (payBtn) {
    payBtn.addEventListener("click", onPayClick);
  }

  function onPayClick() {
    var emailEl = document.getElementById("email");
    var errEl = document.getElementById("error");
    var planEl = document.querySelector('input[name="plan"]:checked');

    var email = (emailEl && emailEl.value || "").trim();
    var plan = planEl ? planEl.value : "single";

    if (!email || email.indexOf("@") === -1) {
      showError(errEl, "Please enter a valid email address.");
      emailEl && emailEl.focus();
      return;
    }

    setBusy(payBtn, true, "Redirecting to Lahza…");
    hideError(errEl);

    fetch(API_BASE + "/lahza/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, plan: plan }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.success || !data.authorization_url) {
          throw new Error(data && data.error || "init_failed");
        }
        window.location.href = data.authorization_url;
      })
      .catch(function (e) {
        setBusy(payBtn, false, "Continue to secure checkout →");
        showError(errEl, "Couldn't start checkout (" + e.message + "). Please try again, or use the Gumroad link below.");
      });
  }

  function setBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = label;
  }

  function showError(el, msg) {
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
  function hideError(el) {
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
  }

  // ---------- success.html ----------
  var loadingEl = document.getElementById("state-loading");
  var readyEl = document.getElementById("state-ready");
  var pendingEl = document.getElementById("state-pending");
  var errorEl = document.getElementById("state-error");

  if (loadingEl && readyEl && pendingEl && errorEl) {
    runSuccessFlow();
  }

  function runSuccessFlow() {
    var ref = new URLSearchParams(window.location.search).get("reference") ||
              new URLSearchParams(window.location.search).get("trxref");
    setText("ref-pending", ref || "—");
    setText("ref-error", ref || "—");

    if (!ref) {
      show(errorEl);
      hide(loadingEl);
      setText("error-msg", "No transaction reference found. If you completed payment, check your email for the license key.");
      return;
    }

    var maxAttempts = 30;       // 30 × 2s = 60 seconds total
    var intervalMs = 2000;
    var attempt = 0;

    var tick = function () {
      attempt += 1;
      fetch(API_BASE + "/lahza/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.success && data.license_key) {
            hide(loadingEl);
            show(readyEl);
            setText("key", data.license_key);
            setText("email", data.email || "your address");
            wireCopyButton();
            return;
          }
          if (attempt >= maxAttempts) {
            hide(loadingEl);
            show(pendingEl);
            return;
          }
          setTimeout(tick, intervalMs);
        })
        .catch(function () {
          if (attempt >= maxAttempts) {
            hide(loadingEl);
            show(pendingEl);
            return;
          }
          setTimeout(tick, intervalMs);
        });
    };

    tick();
  }

  function wireCopyButton() {
    var btn = document.getElementById("copy");
    var keyEl = document.getElementById("key");
    if (!btn || !keyEl) return;
    btn.addEventListener("click", function () {
      var key = keyEl.textContent || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(key).then(function () {
          var prev = btn.textContent;
          btn.textContent = "Copied";
          setTimeout(function () { btn.textContent = prev; }, 1500);
        });
      }
    });
  }

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }
})();
