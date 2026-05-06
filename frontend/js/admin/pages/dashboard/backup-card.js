// Database-backup status panel on the dashboard. Shows the most recent run
// from the doubletap-license-backups workflow, with a "Run now" button that
// fires GitHub workflow_dispatch. Used to be a daily-only schedule with no
// in-product visibility — moving it here so a runner-allocation failure
// (which still emails GitHub Actions notifications) can be re-kicked from
// the admin without dropping into the GitHub UI.

import { el, clear, icon } from "../../lib/dom.js";
import { fmtRelative } from "../../lib/format.js";
import { apiFetch } from "../../lib/api.js";
import { showToast } from "../../lib/toast.js";

// In-flight if GitHub hasn't moved the run past the queue yet — see the
// list of states the API can report at
// https://docs.github.com/en/rest/actions/workflow-runs.
const RUN_IN_FLIGHT_STATES = new Set([
  "in_progress", "queued", "requested", "waiting", "pending",
]);

export const renderBackupCard = () => {
  const card = el("div", { class: "admin-card span-12 backup-card" });
  card.dataset.state = "loading";
  card.append(
    el("div", { class: "backup-header" },
      el("div", { class: "backup-title" },
        icon("shield", 14), " Database backup",
      ),
      el("div", { class: "backup-actions" },
        el("a", {
          class: "backup-link", href: "#", target: "_blank", rel: "noopener noreferrer",
          // href is rewritten in hydrate once we know the workflow URL
          "data-role": "open-github",
        }, "Open in GitHub", icon("arrow-up-right", 12)),
        el("button", {
          class: "backup-run-btn", type: "button", disabled: true,
          "data-role": "run-now",
        }, icon("refresh", 14), " Run now"),
      ),
    ),
    el("div", { class: "backup-body", "data-role": "body" },
      el("div", { class: "admin-loading" }, "Loading backup status…"),
    ),
  );
  return card;
};

// Pulls /admin/backup/status, paints the card, returns whether the latest
// run is still in flight (so a poller knows whether to keep going). Called
// on initial dashboard render and on each poll tick after a manual dispatch.
export const hydrateBackupCard = async (card) => {
  const body = card.querySelector('[data-role="body"]');
  const runBtn = card.querySelector('[data-role="run-now"]');
  const ghLink = card.querySelector('[data-role="open-github"]');

  let data;
  try {
    data = await apiFetch("/admin/backup/status");
  } catch (err) {
    clear(body);
    body.append(
      el("div", { class: "backup-error" },
        `Couldn't load backup status: ${err.message || err}`),
    );
    return false;
  }

  if (!data.configured) {
    clear(body);
    body.append(renderBackupUnconfigured());
    runBtn.disabled = true;
    return false;
  }

  // Best run = most recent in the list. GitHub returns newest-first.
  const latest = data.runs[0] || null;
  const lastSuccess = data.runs.find((r) => r.conclusion === "success") || null;
  const lastFailure = data.runs.find((r) => r.conclusion === "failure") || null;

  const ghWorkflowUrl =
    `https://github.com/${data.repo}/actions/workflows/${data.workflow}`;
  ghLink.setAttribute("href", ghWorkflowUrl);

  // Stale = no successful run in the last 36 hours. Catches "fail
  // yesterday + fail today" scenarios where the daily cadence broke.
  const staleThresholdMs = 36 * 60 * 60 * 1000;
  const lastSuccessAge = lastSuccess
    ? Date.now() - new Date(lastSuccess.run_started_at).getTime()
    : Infinity;
  const isStale = lastSuccessAge > staleThresholdMs;

  clear(body);
  body.append(renderBackupSummary({
    latest, lastSuccess, lastFailure, isStale, repo: data.repo,
  }));

  // The "Run now" button is disabled while a run is in flight, both to
  // prevent duplicate dispatches and to communicate that something is
  // already happening.
  const inFlight = !!latest && RUN_IN_FLIGHT_STATES.has(latest.status);
  runBtn.disabled = inFlight;
  runBtn.onclick = inFlight ? null : async () => {
    runBtn.disabled = true;
    showToast("Backup started — watching for completion");
    try {
      await apiFetch("/admin/backup/run", { method: "POST" });
      // GitHub workflow_dispatch is fire-and-forget; the run takes a
      // moment to register, then runs ~25-60s. Poll every 5s until the
      // run completes (status leaves the in-flight set) so the user
      // doesn't need to refresh, capped at 3 min total in case GitHub
      // gets stuck and we'd otherwise poll forever.
      pollBackupUntilComplete(card);
    } catch (err) {
      runBtn.disabled = false;
      showToast(err.message || "Couldn't start backup", "error");
    }
  };

  return inFlight;
};

const pollBackupUntilComplete = (card) => {
  const startedAt = Date.now();
  const maxDurationMs = 3 * 60 * 1000;
  const intervalMs = 5000;
  // First tick after 3s — GitHub takes ~1-3s to register a fresh
  // workflow_dispatch in the runs list, so polling immediately would
  // just show stale data.
  const tick = async () => {
    if (Date.now() - startedAt > maxDurationMs) {
      showToast("Backup poll timed out — refresh to check status", "error");
      return;
    }
    const stillRunning = await hydrateBackupCard(card);
    if (stillRunning) {
      setTimeout(tick, intervalMs);
    } else {
      // Final state landed — surface a quick confirmation. The card's
      // own state dot already shows healthy/failed; toast just makes
      // the transition unmissable.
      showToast("Backup finished");
    }
  };
  setTimeout(tick, 3000);
};

const renderBackupUnconfigured = () =>
  el("div", { class: "backup-unconfigured" },
    el("div", { class: "backup-status-line" },
      icon("settings", 14), " Backup token not configured"),
    el("p", { class: "backup-help" },
      "Set the BACKUP_GH_TOKEN secret on the API Worker to enable backup status + manual runs. ",
      "Use a fine-grained PAT with Actions: read+write on HadiDireya/doubletap-license-backups."),
  );

const renderBackupSummary = ({ latest, lastSuccess, lastFailure, isStale, repo }) => {
  const wrap = el("div", { class: "backup-summary" });

  if (!latest) {
    wrap.append(
      el("div", { class: "backup-status-line" },
        icon("clock", 14), " No runs recorded yet"),
    );
    return wrap;
  }

  // Headline state — derived from the most recent run + freshness window.
  let stateClass, stateLabel;
  if (latest.status === "in_progress" || latest.status === "queued" ||
      latest.status === "requested" || latest.status === "waiting") {
    stateClass = "is-running";
    stateLabel = "Running…";
  } else if (latest.conclusion === "success") {
    stateClass = isStale ? "is-warn" : "is-ok";
    stateLabel = isStale ? "Stale" : "Healthy";
  } else if (latest.conclusion === "failure") {
    stateClass = "is-fail";
    stateLabel = "Last run failed";
  } else if (latest.conclusion === "cancelled") {
    stateClass = "is-fail";
    stateLabel = "Last run cancelled";
  } else {
    stateClass = "is-warn";
    stateLabel = latest.conclusion || latest.status;
  }

  wrap.append(
    el("div", { class: `backup-state ${stateClass}` },
      el("span", { class: "backup-state-dot" }),
      el("span", { class: "backup-state-label" }, stateLabel),
    ),
  );

  const detail = el("dl", { class: "backup-detail-grid" });
  const addRow = (label, value) =>
    detail.append(el("dt", {}, label), el("dd", {}, value));

  addRow("Last run",
    el("a", {
      href: latest.html_url, target: "_blank", rel: "noopener noreferrer",
      class: "backup-run-link",
    }, fmtRelative(latest.run_started_at), " · ", latest.event));
  if (lastSuccess) {
    addRow("Last success", fmtRelative(lastSuccess.run_started_at));
  } else {
    addRow("Last success", "never");
  }
  if (lastFailure && lastFailure.id !== latest.id) {
    addRow("Last failure",
      el("a", {
        href: lastFailure.html_url, target: "_blank", rel: "noopener noreferrer",
        class: "backup-run-link",
      }, fmtRelative(lastFailure.run_started_at)));
  }
  addRow("Repo",
    el("a", {
      href: `https://github.com/${repo}`, target: "_blank", rel: "noopener noreferrer",
      class: "backup-run-link",
    }, repo));

  wrap.append(detail);
  return wrap;
};
