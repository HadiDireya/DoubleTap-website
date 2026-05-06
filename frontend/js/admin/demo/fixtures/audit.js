import { ADMIN_EMAIL } from "../../config.js";

export const auditFixture = (path) => {
  if (path.startsWith("/admin/audit/facets")) {
    return {
      actions: [
        "license.revoke", "license.unrevoke", "license.issue_comp",
        "license.update_max_uses", "license.change_email", "license.resend_email",
        "activation.free", "trial.extend", "trial.terminate",
        "user.ban", "user.unban", "user.delete", "user.change_email",
      ],
      target_types: ["license", "trial", "user"],
      actors: [ADMIN_EMAIL],
    };
  }
  if (path.startsWith("/admin/audit")) {
    const now = Date.now();
    const rows = [
      { id: "a1", actor_email: ADMIN_EMAIL, action: "license.issue_comp",
        target_type: "license", target_id: "LZ-COMP-9XYZ8-WV7TU",
        details: JSON.stringify({ email: "press@example.com", max_uses: 1, note: "TechCrunch reviewer", emailed: true }),
        created_at: new Date(now - 30 * 60_000).toISOString() },
      { id: "a2", actor_email: ADMIN_EMAIL, action: "license.revoke",
        target_type: "license", target_id: "LZ-DEAD-BEEF-CAFE-FOOD",
        details: JSON.stringify({ reason: "chargeback received via Lahza" }),
        created_at: new Date(now - 4 * 3600_000).toISOString() },
      { id: "a3", actor_email: ADMIN_EMAIL, action: "license.change_email",
        target_type: "license", target_id: "LZ-AB12-CD34-EF56-GH78",
        details: JSON.stringify({ from: "old@example.com", to: "alice@example.com" }),
        created_at: new Date(now - 22 * 3600_000).toISOString() },
      { id: "a4", actor_email: ADMIN_EMAIL, action: "activation.free",
        target_type: "license", target_id: "LZ-AB12-CD34-EF56-GH78",
        details: JSON.stringify({ activation_id: 7, machine_id: "MAC-OLD-LAPTOP-A1B2", activated_at: new Date(now - 30 * 86400_000).toISOString() }),
        created_at: new Date(now - 25 * 3600_000).toISOString() },
      { id: "a5", actor_email: ADMIN_EMAIL, action: "license.update_max_uses",
        target_type: "license", target_id: "LZ-XY34-WV56-UV78-TS90",
        details: JSON.stringify({ from: 1, to: 2 }),
        created_at: new Date(now - 3 * 86400_000).toISOString() },
      { id: "a6", actor_email: ADMIN_EMAIL, action: "license.resend_email",
        target_type: "license", target_id: "LZ-AB12-CD34-EF56-GH78",
        details: JSON.stringify({ to: "alice@example.com" }),
        created_at: new Date(now - 6 * 86400_000).toISOString() },
    ];
    return { rows, page: 1, limit: 50, total: rows.length };
  }
  return undefined;
};
