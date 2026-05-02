/* ================================================================
   DoubleTap — download.js
   Resolve every [data-download-latest] element's href to the latest
   .dmg asset from the GitHub releases repo, so "Download" buttons
   trigger a direct file download instead of opening a release page.
   Falls back silently to the existing href on any error.
   ================================================================ */

const REPO = 'HadiDireya/DoubleTap-releases';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const targets = document.querySelectorAll('[data-download-latest]');

if (targets.length > 0) {
  fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
    .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
    .then((release) => {
      const dmg = (release.assets || []).find((a) =>
        typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.dmg'),
      );
      if (!dmg?.browser_download_url) return;
      targets.forEach((el) => {
        el.href = dmg.browser_download_url;
        el.setAttribute('download', dmg.name);
      });
    })
    .catch(() => { /* fallback: existing href stays */ });
}
