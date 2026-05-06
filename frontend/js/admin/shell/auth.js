// Better Auth wrappers. signOut clears the cookie and bounces to the public
// site; startSocial / sendMagicLink kick off the OAuth or magic-link flow.
// The OAuth response includes a redirect URL — refuse to navigate anywhere
// not on OAUTH_HOSTS so a tampered response can't phish the admin.

import { OAUTH_HOSTS } from "../config.js";
import { apiFetch } from "../lib/api.js";

const safeOauthRedirect = (raw) => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && OAUTH_HOSTS.has(u.host);
  } catch (_) {
    return false;
  }
};

export const startSocial = async (provider) => {
  const callback = `${window.location.origin}/admin/`;
  const data = await apiFetch("/auth/sign-in/social", {
    method: "POST",
    body: JSON.stringify({ provider, callbackURL: callback }),
  });
  const target = data && typeof data.url === "string" ? data.url : null;
  if (!target || !safeOauthRedirect(target)) throw new Error("untrusted_redirect");
  window.location.assign(target);
};

export const sendMagicLink = (email) =>
  apiFetch("/auth/sign-in/magic-link", {
    method: "POST",
    body: JSON.stringify({ email, callbackURL: `${window.location.origin}/admin/` }),
  });

export const signOut = async () => {
  try {
    await apiFetch("/auth/sign-out", { method: "POST" });
  } catch (_) {
    // Even if sign-out fails server-side, clearing the cookie locally is
    // best-effort — the next /admin/me call will 401 and re-gate the user.
  }
  window.location.href = "/";
};
