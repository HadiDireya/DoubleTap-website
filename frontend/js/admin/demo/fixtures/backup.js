export const backupFixture = (path) => {
  if (path === "/admin/backup/status") {
    const now = Date.now();
    return {
      configured: true,
      repo: "HadiDireya/doubletap-license-backups",
      workflow: "backup.yml",
      runs: [
        { id: 100, status: "completed", conclusion: "success",
          created_at: new Date(now - 5 * 3600_000).toISOString(),
          updated_at: new Date(now - 5 * 3600_000 + 25_000).toISOString(),
          run_started_at: new Date(now - 5 * 3600_000).toISOString(),
          html_url: "https://github.com/HadiDireya/doubletap-license-backups/actions/runs/100",
          event: "schedule" },
        { id: 99, status: "completed", conclusion: "failure",
          created_at: new Date(now - 30 * 3600_000).toISOString(),
          updated_at: new Date(now - 30 * 3600_000 + 900_000).toISOString(),
          run_started_at: new Date(now - 30 * 3600_000).toISOString(),
          html_url: "https://github.com/HadiDireya/doubletap-license-backups/actions/runs/99",
          event: "schedule" },
      ],
    };
  }
  if (path === "/admin/backup/run") {
    return { ok: true };
  }
  return undefined;
};
