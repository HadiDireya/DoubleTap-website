// Feedback post detail drawer. Shows full body, comments thread (with
// per-comment delete), audit timeline, status changer, and delete-post
// action. Pin/unpin + ban-author are deferred — see backend feedback.ts
// header for the deferred-migration shape.
//
// Status changes use an optimistic in-place update: we synthesize an audit
// entry locally so the timeline reflects the change without a full
// re-fetch (which would tear down the aria-live banner before AT could
// announce it). Delete-post takes the canonical path — close drawer, drop
// the cached filter sig, re-render the list — because the row needs to
// disappear from the table.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtDateTime } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { showToast } from "../../lib/toast.js";
import { confirmModal } from "../../lib/modal.js";
import { renderAuditItem } from "../../lib/audit-item.js";
import { parseHash, updateHashParams } from "../../lib/url.js";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUS_BADGE,
  renderFeedback,
} from "./index.js";
import { clearLastFilterSig } from "../../router.js";

let drawerEl = null;
let drawerBackdrop = null;
let drawerLoadingId = null;

export const closeFeedbackDrawer = () => {
  if (!drawerEl) return;
  drawerEl.classList.remove("is-open");
  drawerBackdrop?.classList.remove("is-open");
  const { path, params } = parseHash();
  if (params.has("id")) {
    params.delete("id");
    const qs = params.toString();
    history.replaceState(null, "", `#${path}${qs ? `?${qs}` : ""}`);
  }
  // Local capture so a fresh open within the close animation doesn't get
  // torn down here — see licenses/drawer.js for the canonical note.
  const elToRemove = drawerEl;
  const backdropToRemove = drawerBackdrop;
  drawerEl = null;
  drawerBackdrop = null;
  setTimeout(() => {
    elToRemove?.remove();
    backdropToRemove?.remove();
  }, 260);
};

export const openFeedbackDrawer = async (postId) => {
  if (drawerLoadingId === postId) return;
  drawerLoadingId = postId;

  updateHashParams((p) => p.set("id", postId));

  if (!drawerEl) {
    drawerBackdrop = el("div", { class: "lic-drawer-backdrop", onclick: closeFeedbackDrawer });
    drawerEl = el("aside", { class: "lic-drawer", role: "dialog", "aria-modal": "true" });
    document.body.append(drawerBackdrop, drawerEl);
    requestAnimationFrame(() => {
      drawerBackdrop.classList.add("is-open");
      drawerEl.classList.add("is-open");
    });
  }

  clear(drawerEl);
  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", { class: "lic-drawer-key" }, postId),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeFeedbackDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
    el("div", { class: "lic-drawer-body" },
      el("div", { class: "admin-loading" }, "Loading…"),
    ),
  );

  let data;
  try {
    data = await apiFetch(`/admin/feedback/${encodeURIComponent(postId)}`);
  } catch (err) {
    clear(drawerEl);
    drawerEl.append(
      el("div", { class: "lic-drawer-header" },
        el("div", { class: "lic-drawer-key" }, postId),
        el("button", { class: "lic-drawer-close", type: "button", onclick: closeFeedbackDrawer, "aria-label": "Close" },
          icon("x-circle", 18)),
      ),
      el("div", { class: "lic-drawer-body" },
        el("div", { class: "admin-error" }, `Couldn't load post: ${err.message || err}`),
      ),
    );
    if (drawerLoadingId === postId) drawerLoadingId = null;
    return;
  }

  paintFeedbackDrawer(data);
  if (drawerLoadingId === postId) drawerLoadingId = null;
};

const paintFeedbackDrawer = (data) => {
  if (!drawerEl) return;
  clear(drawerEl);

  const statusClass = FEEDBACK_STATUS_BADGE[data.status] || "status-expired";

  drawerEl.append(
    el("div", { class: "lic-drawer-header" },
      el("div", {},
        el("div", { class: "lic-drawer-key is-prose" },
          el("span", {}, data.title),
        ),
        el("div", { class: "lic-drawer-badges" },
          el("span", { class: `lic-badge fb-type-${data.type}` }, (data.type || "").toUpperCase()),
          el("span", { class: `lic-badge ${statusClass}` },
            (data.status || "").replace(/_/g, " ").toUpperCase()),
        ),
      ),
      el("button", { class: "lic-drawer-close", type: "button", onclick: closeFeedbackDrawer, "aria-label": "Close" },
        icon("x-circle", 18)),
    ),
  );

  const body = el("div", { class: "lic-drawer-body" });

  // Status banner — aria-live so screen readers announce status changes
  // after a successful PATCH /:id/status round-trip without focus-stealing.
  const banner = el("div", {
    class: "feedback-status-banner",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
  });
  body.append(banner);

  // Meta grid — author + post id (with copy) + timestamps + vote count.
  const meta = el("dl", { class: "lic-meta-grid" });
  const addMeta = (label, value) => {
    if (value == null || value === "") return;
    meta.append(el("dt", {}, label), el("dd", {}, value));
  };
  if (data.author) {
    addMeta("Author",
      el("a", {
        class: "lic-pivot-link",
        href: `#/customers?u=${encodeURIComponent(data.author.id)}`,
      }, data.author.name || data.author.email || data.author.id));
    addMeta("Author email", data.author.email);
  } else {
    addMeta("Author", "— (account deleted)");
  }
  addMeta("Posted", fmtDateTime(data.created_at));
  if (data.updated_at && data.updated_at !== data.created_at) {
    addMeta("Updated", fmtDateTime(data.updated_at));
  }
  addMeta("Votes", String(data.vote_count ?? 0));
  meta.append(
    el("dt", {}, "Post id"),
    el("dd", { class: "lic-meta-copyable" },
      el("span", { class: "lic-meta-mono" }, data.id),
      el("button", {
        class: "lic-drawer-key-copy",
        type: "button",
        "aria-label": "Copy post id",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(data.id);
            showToast("Post id copied");
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

  // Post body — full text, preserved whitespace.
  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Post body"),
      el("div", { class: "feedback-post-body" }, data.body || ""),
    ),
  );

  // Status change controls + danger actions.
  const statusSelectId = `feedback-status-${data.id}`;
  const statusSel = el("select", {
    id: statusSelectId,
    class: "audit-select",
    onchange: async (e) => {
      const next = e.target.value;
      if (next === data.status) return;
      statusSel.disabled = true;
      try {
        const result = await apiFetch(`/admin/feedback/${encodeURIComponent(data.id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: next }),
        });
        if (result.noop) {
          showToast(`Already ${next.replace(/_/g, " ")}`);
        } else {
          showToast(`Status → ${next.replace(/_/g, " ")}`);
        }
        // Optimistic in-place update — avoid a full re-fetch + re-paint so
        // the aria-live banner survives for screen readers (a fresh open
        // would clear the drawer and wipe it before announcement).
        // Append a synthesized audit row so the timeline reflects the
        // change locally; the next genuine open fetches canonical rows
        // from the server. statusSel is re-enabled because we keep the
        // existing DOM node — no rebuild, so its disabled flag would leak.
        const prevStatus = data.status;
        data.status = next;
        // Mirror the backend snapshot shape so renderAuditItem prints the
        // same one-liner the server would after a refresh.
        const localAuditEntry = {
          id: `local-${Date.now()}`,
          actor_email: document.querySelector(".admin-topbar-email")?.textContent || "you",
          action: "feedback.update_status",
          target_type: "feedback_post",
          target_id: data.id,
          details: JSON.stringify({
            from: prevStatus,
            to: next,
            title: data.title,
            author_email: data.author?.email ?? null,
            author_name: data.author?.name ?? null,
          }),
          created_at: new Date().toISOString(),
        };
        data.audit = [localAuditEntry, ...(data.audit || [])];
        // Update the status badge in the drawer header so it matches.
        const headerBadge = drawerEl?.querySelector(
          ".lic-drawer-badges .lic-badge:not([class*='fb-type-'])",
        );
        if (headerBadge) {
          headerBadge.className = `lic-badge ${FEEDBACK_STATUS_BADGE[next] || "status-expired"}`;
          headerBadge.textContent = (next || "").replace(/_/g, " ").toUpperCase();
        }
        // Prepend the new audit entry to the audit timeline list, scoped
        // to .feedback-audit-section so we don't collide with the comments
        // section's own empty placeholder.
        const auditSection = drawerEl?.querySelector(".feedback-audit-section");
        const auditList = auditSection?.querySelector(".lic-audit-list");
        if (auditList) {
          auditList.prepend(renderAuditItem(localAuditEntry));
        } else if (auditSection) {
          const emptyPlaceholder = auditSection.querySelector(".lic-empty");
          if (emptyPlaceholder) {
            const newList = el("div", { class: "lic-audit-list" });
            newList.append(renderAuditItem(localAuditEntry));
            emptyPlaceholder.replaceWith(newList);
          }
        }
        banner.textContent = `Status set to ${next.replace(/_/g, " ")}.`;
        statusSel.disabled = false;
      } catch (err) {
        statusSel.disabled = false;
        statusSel.value = data.status;
        showToast(err.message || "Couldn't change status", "error");
      }
    },
  });
  for (const [k, label] of Object.entries(FEEDBACK_STATUS_LABELS)) {
    if (k === "all") continue;
    statusSel.append(el("option", { value: k, ...(k === data.status ? { selected: true } : {}) }, label));
  }

  const actions = el("div", { class: "lic-actions" });
  actions.append(
    el("label", { class: "feedback-status-label", for: statusSelectId },
      el("span", {}, "Set status"),
      statusSel,
    ),
    el("button", {
      class: "lic-action-btn is-danger", type: "button",
      onclick: async () => {
        const ok = await confirmModal({
          title: "Delete this post?",
          message: "Cascades to all comments and votes on this post. The audit row keeps a snapshot of the title and author. This cannot be undone.",
          confirmLabel: "Delete post",
          danger: true,
        });
        if (!ok) return;
        try {
          await apiFetch(`/admin/feedback/${encodeURIComponent(data.id)}`, { method: "DELETE" });
          showToast("Post deleted");
          // Close drawer first (which strips ?id= via replaceState), then
          // explicitly invalidate the cached filter sig and re-render
          // renderFeedback directly. Hash-driven re-render doesn't fire
          // when the new hash equals the current one, so calling
          // renderFeedback is the only reliable path to drop the now-
          // stale row.
          const canvas = document.querySelector(".admin-canvas");
          closeFeedbackDrawer();
          clearLastFilterSig("feedback");
          const { params: freshParams } = parseHash();
          if (canvas) renderFeedback(canvas, { params: freshParams });
        } catch (err) {
          showToast(err.message || "Couldn't delete", "error");
        }
      },
    }, icon("trash", 12), "Delete post"),
  );

  body.append(
    el("div", {},
      el("div", { class: "lic-section-title" }, "Actions"),
      actions,
    ),
  );

  // Comments
  const comments = data.comments || [];
  const commentsSection = el("div", {},
    el("div", { class: "lic-section-title" }, `Comments (${comments.length})`),
  );
  if (comments.length === 0) {
    commentsSection.append(el("div", { class: "lic-empty" }, "No comments on this post."));
  } else {
    const list = el("div", { class: "lic-activations-list" });
    for (const cm of comments) {
      const authorLink = cm.author
        ? el("a", {
            class: "lic-pivot-link",
            href: `#/customers?u=${encodeURIComponent(cm.author.id)}`,
          }, cm.author.name || cm.author.email || cm.author.id)
        : el("span", { class: "lic-meta" }, "— (account deleted)");
      const deleteBtn = el("button", {
        class: "lic-action-btn is-danger feedback-comment-delete",
        type: "button",
        "aria-label": "Delete comment",
        onclick: async () => {
          const ok = await confirmModal({
            title: "Delete this comment?",
            message: "The audit row keeps a snapshot of the author and a body preview. This cannot be undone.",
            confirmLabel: "Delete comment",
            danger: true,
          });
          if (!ok) return;
          try {
            await apiFetch(
              `/admin/feedback/${encodeURIComponent(data.id)}/comments/${encodeURIComponent(cm.id)}`,
              { method: "DELETE" },
            );
            showToast("Comment deleted");
            openFeedbackDrawer(data.id);
          } catch (err) {
            showToast(err.message || "Couldn't delete comment", "error");
          }
        },
      }, icon("trash", 12), "Delete");
      list.append(
        el("div", { class: "lic-activation feedback-comment" },
          el("div", { class: "feedback-comment-main" },
            el("div", { class: "feedback-comment-meta" },
              authorLink, " · ", fmtDateTime(cm.created_at),
            ),
            el("div", { class: "feedback-comment-body" }, cm.body || ""),
          ),
          deleteBtn,
        ),
      );
    }
    commentsSection.append(list);
  }
  body.append(commentsSection);

  // Audit timeline — reuse renderAuditItem so feedback/license/trial
  // timelines all render the same way. The wrapper carries a class so
  // the optimistic-update path in the status onchange handler can find
  // and mutate this section without colliding with the comments section's
  // own .lic-empty placeholder.
  const auditSection = el("div", { class: "feedback-audit-section" },
    el("div", { class: "lic-section-title" },
      "Audit timeline",
      " · ",
      el("a", {
        class: "audit-target-link",
        href: `#/audit?target_type=feedback_post&target_id=${encodeURIComponent(data.id)}`,
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
