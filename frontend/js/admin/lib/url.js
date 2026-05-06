// Hash-routing helpers. The admin is a single-page app routed entirely by
// `location.hash`, so URL state lives in `#<path>?<params>`. parseHash splits
// that; updateHashParams mutates the params in place and triggers a single
// hashchange event (the router de-bounces same-filter changes via filter
// signatures — see router.js).

export const parseHash = () => {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  return { path, params };
};

export const updateHashParams = (mutate) => {
  const { path, params } = parseHash();
  mutate(params);
  const qs = params.toString();
  window.location.hash = `#${path}${qs ? `?${qs}` : ""}`;
};

// <input type="date"> wants `YYYY-MM-DD` in local time — converting an ISO
// string with `.toISOString().slice(0, 10)` would silently shift the picker
// off-by-one for users east of UTC just before midnight.
export const dateInputValueFromISO = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Inverse of dateInputValueFromISO — anchors a YYYY-MM-DD string to local
// midnight before serialising to ISO so the SINCE/UNTIL filter aligns with
// what the user sees in the picker.
export const localMidnightISO = (yyyymmdd) => {
  if (!yyyymmdd) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) return "";
  const [, y, mo, d] = m;
  return new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10)).toISOString();
};
