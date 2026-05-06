import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { writeAudit } from "../../lib/audit";
import type { AdminVariables } from "./index";
import type { Env } from "../../env";

// The license-server D1 is dumped daily into a public-archive repo; this
// admin module surfaces the workflow's recent runs and lets the admin
// fire a manual workflow_dispatch when the scheduled run misses (e.g.
// the runner-allocation timeout that triggered today's email).
//
// Repo + workflow are constants because there's exactly one of each.
// If the backup repo ever moves (private→public or branch rename) this
// is a single edit point.
const BACKUP_REPO = "HadiDireya/doubletap-license-backups";
const BACKUP_WORKFLOW = "backup.yml";
const BACKUP_REF = "main";

const backup = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  // GitHub requires a User-Agent on every request — they reject default
  // fetch with a 403 if it's missing.
  "User-Agent": "doubletap-admin",
  "X-GitHub-Api-Version": "2022-11-28",
});

// ── GET /status — last 10 runs + configured-flag ──────────────────────────
//
// `configured: false` lets the frontend render an "unconfigured" empty
// state with setup instructions instead of an error toast, so the page
// works on a fresh deploy before the secret is set.
backup.get("/status", async (c) => {
  if (!c.env.BACKUP_GH_TOKEN) {
    return c.json({ configured: false, runs: [] });
  }
  const url =
    `https://api.github.com/repos/${BACKUP_REPO}/actions/workflows/${BACKUP_WORKFLOW}` +
    `/runs?per_page=10`;
  const res = await fetch(url, { headers: ghHeaders(c.env.BACKUP_GH_TOKEN) });
  if (!res.ok) {
    const text = await res.text();
    throw new HTTPException(502, {
      message: `github_runs_failed: ${res.status} ${text.slice(0, 200)}`,
    });
  }
  const data = await res.json<{
    workflow_runs: Array<{
      id: number;
      status: string;
      conclusion: string | null;
      created_at: string;
      updated_at: string;
      html_url: string;
      event: string;
      run_started_at: string;
    }>;
  }>();
  return c.json({
    configured: true,
    repo: BACKUP_REPO,
    workflow: BACKUP_WORKFLOW,
    runs: data.workflow_runs.map((r) => ({
      id: r.id,
      status: r.status,
      conclusion: r.conclusion,
      created_at: r.created_at,
      updated_at: r.updated_at,
      run_started_at: r.run_started_at,
      html_url: r.html_url,
      event: r.event,
    })),
  });
});

// ── POST /run — fire workflow_dispatch ────────────────────────────────────
backup.post("/run", async (c) => {
  if (!c.env.BACKUP_GH_TOKEN) {
    throw new HTTPException(500, { message: "backup_token_unconfigured" });
  }
  const url =
    `https://api.github.com/repos/${BACKUP_REPO}/actions/workflows/${BACKUP_WORKFLOW}` +
    `/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: ghHeaders(c.env.BACKUP_GH_TOKEN),
    body: JSON.stringify({ ref: BACKUP_REF }),
  });
  // GitHub returns 204 No Content on success; any non-2xx surfaces the
  // error body so the admin can see what's wrong (e.g. token scope drift,
  // workflow renamed).
  if (!res.ok) {
    const text = await res.text();
    throw new HTTPException(502, {
      message: `github_dispatch_failed: ${res.status} ${text.slice(0, 200)}`,
    });
  }
  await writeAudit(c, {
    actorEmail: c.var.session.user.email,
    action: "backup.trigger",
    targetType: "backup",
    targetId: BACKUP_WORKFLOW,
  });
  return c.json({ ok: true });
});

export default backup;
