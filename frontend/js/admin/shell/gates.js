// Pre-shell screens: signed-out, signed-in-but-not-admin, network failure.
// Replaces #root in place; once cleared by boot(), the shell takes over and
// gates aren't shown again until the next reload.

import { el, clear } from "../lib/dom.js";
import { startSocial, sendMagicLink, signOut } from "./auth.js";

export const renderGate = (root, kind) => {
  clear(root);
  const wrap = el("div", { class: "admin-gate" });
  if (kind === "signin") {
    const status = el("p", { class: "admin-gate-status" });
    const onSocial = (provider) => async () => {
      status.textContent = `Redirecting to ${provider}…`;
      try {
        await startSocial(provider);
      } catch (err) {
        status.textContent = `Sign-in failed (${err.message || err}). Try magic link below.`;
      }
    };
    const onMagic = async (e) => {
      e.preventDefault();
      const input = wrap.querySelector("input[type=email]");
      const email = input ? input.value.trim() : "";
      if (!email) return;
      status.textContent = "Sending magic link…";
      try {
        await sendMagicLink(email);
        status.textContent = "Check your email for the sign-in link.";
      } catch (err) {
        status.textContent = `Couldn’t send link (${err.message || err}).`;
      }
    };
    wrap.append(
      el("div", { class: "admin-gate-title" }, "Sign in to continue"),
      el("p", { class: "admin-gate-message" },
        "This area is for the DoubleTap admin only. Sign in with the admin Google account."),
      el("div", { class: "admin-gate-buttons" },
        el("button", { class: "admin-gate-cta", type: "button", onclick: onSocial("google") }, "Sign in with Google"),
      ),
      el("form", { class: "admin-gate-magic", onsubmit: onMagic },
        el("input", { type: "email", placeholder: "or email me a link…", required: true, autocomplete: "email" }),
        el("button", { class: "admin-gate-magic-cta", type: "submit" }, "Send"),
      ),
      status,
    );
  } else if (kind === "forbidden") {
    wrap.append(
      el("div", { class: "admin-gate-title" }, "Not authorised"),
      el("p", { class: "admin-gate-message" },
        "Your account is signed in but does not have admin access. Sign out and back in with the admin account."),
      el("button", { class: "admin-gate-cta", type: "button", onclick: signOut }, "Sign out"),
    );
  } else {
    wrap.append(
      el("div", { class: "admin-gate-title" }, "Couldn’t reach the API"),
      el("p", { class: "admin-gate-message" },
        "The admin API didn’t respond. Check the api.doubletap-app.com Worker is up, then refresh."),
      el("button", { class: "admin-gate-cta", type: "button", onclick: () => window.location.reload() }, "Retry"),
    );
  }
  root.append(wrap);
};
