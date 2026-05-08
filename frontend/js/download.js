/* ================================================================
   DoubleTap — download.js
   Resolve every [data-download-latest] element's href to the latest
   .dmg asset from the GitHub releases repo, so "Download" buttons
   trigger a direct file download instead of opening a release page.
   Falls back silently to the existing href on any error.
   ================================================================ */

const REPO = 'HadiDireya/DoubleTap-releases';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
// Pin to github.com + the releases/download/ path on this repo. Parse-then-
// check so a `..`-traversal asset URL (which `startsWith` would happily
// accept) can't divert the Download buttons to another repo's release.
const EXPECTED_HOST = 'github.com';
const EXPECTED_PATH_PREFIX = `/${REPO}/releases/download/`;
const safeReleaseUrl = (raw) => {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (u.host !== EXPECTED_HOST) return null;
    if (!u.pathname.startsWith(EXPECTED_PATH_PREFIX)) return null;
    return u.href;
  } catch (_) { return null; }
};
const targets = document.querySelectorAll('[data-download-latest]');

if (targets.length > 0) {
  fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then((release) => {
      let dmg = null;
      let safeUrl = null;
      for (const a of release.assets || []) {
        if (typeof a?.name !== 'string' || !a.name.toLowerCase().endsWith('.dmg')) continue;
        const url = safeReleaseUrl(a.browser_download_url);
        if (!url) continue;
        dmg = a;
        safeUrl = url;
        break;
      }
      if (!dmg || !safeUrl) return;
      targets.forEach((el) => {
        el.href = safeUrl;
        el.setAttribute('download', dmg.name);
      });
    })
    .catch(() => { /* fallback: existing href stays */ });
}
