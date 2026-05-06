// DOM construction helpers. Every node in the admin is built through `el`
// (no innerHTML — CSP forbids it). `el` accepts strings/numbers as text
// children, nested arrays (flattened once), and falsy values are skipped so
// callers can do `condition && el(…)` inline without guards.

import { SVG_NS } from "../config.js";

export const el = (tag, props = {}, ...children) => {
  const isSvg = tag === "svg" || tag === "use" || tag === "path" || tag === "rect";
  const node = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") {
      node.setAttribute("class", v);
    } else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "href" && isSvg) {
      // SVGElement.setAttribute('href', …) works, but xlink:href is the
      // safe fallback for older renderers.
      node.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", v);
      node.setAttribute("href", v);
    } else {
      node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(typeof child === "string" || typeof child === "number" ? String(child) : child);
  }
  return node;
};

export const icon = (id, size = 18) =>
  el("svg", { class: "icon", width: size, height: size, "aria-hidden": "true", focusable: "false" },
    el("use", { href: `#i-${id}` }),
  );

export const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};
