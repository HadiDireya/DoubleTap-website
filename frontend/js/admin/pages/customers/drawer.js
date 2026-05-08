// Customer detail drawer. v1 is read-only — write actions (ban / delete /
// change-email) are deferred. Surfaces linked Gumroad licenses (hard
// userId FK) and Lahza/comp licenses (soft email match), feedback posts,
// and audit timeline.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtDateTime, fmtRelative } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { showToast } from "../../lib/toast.js";
import { renderAuditItem } from "../../lib/audit-item.js";
import { parseHash, updateHashParams } from "../../lib/url.js";

let drawerEl = null;
let drawerBackdrop = null;
let drawerLoadingId = null;

export const closeCustomerDrawer = () => {
  if (!drawerEl) return;
  drawerEl.classList.remove("is-open");
  drawerBackdrop?.classList.remove("is-open");
  const { path, params } = parseHash();
  if (params.has("u")) {
    params.delete("u");
    const qs = params.toString();
    history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
  }
  // Local capture so a fresh open within the close animation doesn't get
  // torn down here — see closeLicenseDrawer for the canonical note.
  const elToRemove = drawerEl;
  const backdropToRemove = drawerBackdrop;
  drawerEl = null;
  drawerBackdrop = null;
  setTimeout(() => {
    elToRemove?.remove();
    backdropToRemove?.remove();
  }, 260);
};

export const openCustomerDrawer = async (userId) => {
  if (drawerLoadingId === userId) return;
  drawerLoadingId = userId;

  updateHashParams((p) => p.set("u", userId));

  if (!drawerEl) {
    drawerBackdrop = el("div", { class: "lic-drawer-backdrop", onclick: closeCustomerDrawer });
    drawerEl = el("aside", { class: "lic-drawer", role: "dialog", "aria-modal": "true" });
    document.body.append(drawerBackdrop, drawerEl);
    requestAnimationFrame(() => {
      drawerBackdrop.classList.add("is-open");
      drawerEl.classList.add("is-open");
    });
  }

  clear(drawerEl);
  // Skeleton uses the bare userId in the header; the prose variant kicks
  // in on paint once we have the user's name.
  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", { class: "lic-drawer-key" }, userId),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeCustomerDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
    el("div", { class: "lic-drawer-body" },
      el("div", { class: "admin-loading" }, "Loading…"),
    ),
  );

  let data;
  try {
    data = await apiFetch(`/admin/users/${encodeURIComponent(userId)}`);
  } catch (err) {
    clear(drawerEl);
    drawerEl.append(
      el("div", { class: "lic-drawer-header" },
        el("div", { class: "lic-drawer-key" }, userId),
        el("button", { class: "lic-drawer-close", type: "button", onclick: closeCustomerDrawer, "aria-label": "Close" },
          icon("x-circle", 18)),
      ),
      el("div", { class: "lic-drawer-body" },
        el("div", { class: "admin-error" }, `Couldn't load customer: ${err.message || err}`),
      ),
    );
    if (drawerLoadingId === userId) drawerLoadingId = null;
    return;
  }

  paintCustomerDrawer(data);
  if (drawerLoadingId === userId) drawerLoadingId = null;
};

const paintCustomerDrawer = (data) => {
  if (!drawerEl) return;
  clear(drawerEl);

  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", {},
        el("div", { class: "lic-drawer-key is-prose" },
          el("span", {}, data.name || data.email || data.id),
        ),
        el("div", { class: "lic-drawer-badges" },
          data.email_verified
            ? el("span", { class: "lic-badge status-active" }, "VERIFIED")
            : el("span", { class: "lic-badge status-expired" }, "PENDING"),
        ),
      ),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeCustomerDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
  );

  const body = el("div", { class: "lic-drawer-body" });

  const meta = el("dl", { class: "lic-meta-grid" });
  const addMeta = (label, value) => {
    if (value == null || value === "") return;
    meta.append(el("dt", {}, label), el("dd", {}, value));
  };
  addMeta("Email", data.email);
  addMeta("Name", data.name);
  addMeta("Joined", fmtDateTime(data.created_at));
  if (data.updated_at && data.updated_at !== data.created_at) {
    addMeta("Updated", fmtDateTime(data.updated_at));
  }
  // User id meta gets a copy button — admins routinely paste this into SQL
  // prompts when cross-referencing a user against raw D1 queries, and the
  // Better Auth nanoid isn't memorable enough to retype.
  meta.append(
    el("dt", {}, "User id"),
    el("dd", { class: "lic-meta-copyable" },
      el("span", { class: "lic-meta-mono" }, data.id),
      el("button", {
        class: "lic-drawer-key-copy",
        type: "button",
        "aria-label": "Copy user id",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(data.id);
            showToast("User id copied");
          } catch (_) { showToast("Couldn't copy", "error"); }
        },
      }, icon("copy", 12)),
    ),
  );
  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Details"),
      meta,
    ),
  );

  // Linked licenses — Gumroad rows are joined hard via userId; Lahza/comp
  // are matched on email, so the section header makes the join basis
  // visible (a Lahza row showing here means email matches data.email).
  const gumroad = data.licenses?.gumroad ?? [];
  const lahza = data.licenses?.lahza ?? [];
  const totalLicenses = gumroad.length + lahza.length;
  const licensesSection = el("div", {},
    el("div", { class: "lic-section-title" }, `Linked licenses (${totalLicenses})`),
  );
  if (totalLicenses === 0) {
    licensesSection.append(el("div", { class: "lic-empty" }, "No licenses linked to this account."));
  } else {
    const list = el("div", { class: "lic-activations-list" });
    for (const r of gumroad) {
      list.append(renderLinkedLicenseRow({
        license_key: r.license_key,
        source: "gumroad",
        meta: `Issued ${fmtDateTime(r.issued_at)} · Sale ${r.sale_id || "—"} · max ${r.max_uses ?? "—"} seats`,
        revoked: false,
      }));
    }
    for (const r of lahza) {
      const isComp = r.license_key.startsWith("LZ-COMP-");
      list.append(renderLinkedLicenseRow({
        license_key: r.license_key,
        source: isComp ? "comp" : "lahza",
        meta: `Issued ${fmtDateTime(r.issued_at)} · ${r.active_activations}/${r.max_uses ?? "—"} seats`,
        revoked: !!r.revoked_at,
      }));
    }
    licensesSection.append(list);
  }
  body.append(licensesSection);

  // Feedback
  const fb = data.feedback ?? { total: 0, recent: [] };
  const feedbackSection = el("div", {},
    el("div", { class: "lic-section-title" }, `Feedback (${fb.total})`),
  );
  if (fb.total === 0) {
    feedbackSection.append(el("div", { class: "lic-empty" }, "No feedback posts."));
  } else {
    const list = el("div", { class: "lic-activations-list" });
    for (const post of fb.recent) {
      list.append(
        el("div", { class: "lic-activation" },
          el("div", {},
            // Plain text title — no `lic-activation-machine` here; that
            // class is for monospaced machine-id-shaped strings, not
            // free-form post titles.
            el("div", { class: "feedback-post-title" }, post.title),
            el("div", { class: "lic-activation-meta" },
              post.type, " · ", post.status, " · ", fmtRelative(post.created_at)),
          ),
        ),
      );
    }
    feedbackSection.append(list);
    if (fb.total > fb.recent.length) {
      feedbackSection.append(
        el("div", { class: "lic-activation-meta" },
          `Showing ${fb.recent.length} of ${fb.total} — full feedback view coming in a later PR.`),
      );
    }
  }
  body.append(feedbackSection);

  // Audit timeline
  const auditSection = el("div", {},
    el("div", { class: "lic-section-title" },
      "Audit timeline",
      " · ",
      el("a", {
        class: "audit-target-link",
        href: `#/audit?target_type=user&target_id=${encodeURIComponent(data.id)}`,
      }, "view in log"),
    ),
  );
  if (!data.audit || data.audit.length === 0) {
    auditSection.append(el("div", { class: "lic-empty" }, "No admin actions recorded yet."));
  } else {
    const list = el("div", { class: "lic-audit-list" });
    for (const e of data.audit) list.append(renderAuditItem(e));
    auditSection.append(list);
  }
  body.append(auditSection);

  drawerEl.append(body);
};

const renderLinkedLicenseRow = ({ license_key, source, meta, revoked }) =>
  el("div", { class: "lic-activation" },
    el("div", {},
      el("a", {
        class: "lic-pivot-link",
        href: `#/licenses?key=${encodeURIComponent(license_key)}`,
      }, license_key),
      el("div", { class: "lic-activation-meta" }, meta),
    ),
    el("span", { class: `lic-badge src-${source}` }, source.toUpperCase()),
    revoked ? el("span", { class: "lic-badge status-revoked" }, "REVOKED") : null,
  );
