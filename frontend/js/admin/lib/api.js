// Single fetch wrapper for every admin API call. Sends cookies (Better Auth
// session lives in an HttpOnly cookie), parses JSON, and throws a tagged
// Error on non-2xx so callers can branch on `err.status`. In demo mode, the
// fixture layer short-circuits before any network is touched.

import { API_BASE, IS_DEMO } from "../config.js";
import { demoFixture } from "../demo/index.js";

export const apiFetch = async (path, opts = {}) => {
  if (IS_DEMO) {
    const fixture = demoFixture(path);
    if (fixture !== undefined) return fixture;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* empty body OK */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
};
