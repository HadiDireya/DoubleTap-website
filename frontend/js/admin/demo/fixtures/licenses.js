import { ADMIN_EMAIL } from "../../config.js";

export const licensesFixture = (path) => {
  if (path.startsWith("/admin/licenses?") || path === "/admin/licenses") {
    const now = Date.now();
    const rows = [
      { source: "lahza", license_key: "LZ-AB12-CD34-EF56-GH78", email: "alice@example.com",
        max_uses: 1, tx_reference: "dt_abc123", issued_at: new Date(now - 30 * 60_000).toISOString(),
        revoked_at: null, active_activations: 1, status: "active" },
      { source: "lahza", license_key: "LZ-XY34-WV56-UV78-TS90", email: "charlie@example.com",
        max_uses: 2, tx_reference: "dt_def456", issued_at: new Date(now - 18 * 3600_000).toISOString(),
        revoked_at: null, active_activations: 2, status: "active" },
      { source: "comp", license_key: "LZ-COMP-9XYZ8-WV7TU", email: "press@example.com",
        max_uses: 1, tx_reference: "comp_aaa", issued_at: new Date(now - 4 * 86400_000).toISOString(),
        revoked_at: null, active_activations: 0, status: "active" },
      { source: "lahza", license_key: "LZ-DEAD-BEEF-CAFE-FOOD", email: "bob@example.com",
        max_uses: 5, tx_reference: "dt_ghi789", issued_at: new Date(now - 9 * 86400_000).toISOString(),
        revoked_at: new Date(now - 1 * 86400_000).toISOString(), active_activations: 1, status: "revoked" },
      { source: "gumroad", license_key: "ABCD1234-EFGH5678", email: "veteran@example.com",
        max_uses: null, tx_reference: "sale_xyz", issued_at: new Date(now - 12 * 86400_000).toISOString(),
        revoked_at: null, active_activations: 1, status: "active" },
    ];
    return {
      rows, page: 1, limit: 50, total: rows.length,
      counts: { lahza: 3, gumroad: 1 },
    };
  }

  if (path.startsWith("/admin/licenses/")) {
    const suffix = path.slice("/admin/licenses/".length).split("?")[0];
    // /admin/licenses/comp — issue-comp endpoint (POST)
    if (suffix === "comp") {
      return {
        ok: true,
        license_key: "LZ-COMP-DEM01-DEM02-DEM03",
        email: "demo@example.com",
        max_uses: 1,
        emailed: true,
      };
    }
    // /admin/licenses/<key>/<action…>  → action result. Detail endpoint
    // is the bare /admin/licenses/<key> (one segment after the prefix).
    if (suffix.includes("/")) {
      return { ok: true };
    }
    const key = decodeURIComponent(suffix);
    const now = Date.now();
    const isComp = key.startsWith("LZ-COMP-");
    const isGumroad = !key.startsWith("LZ-");
    return {
      source: isGumroad ? "gumroad" : isComp ? "comp" : "lahza",
      license_key: key,
      email: "alice@example.com",
      max_uses: isGumroad ? null : 2,
      tx_reference: isGumroad ? null : "dt_demo",
      product_id: isGumroad ? "abc" : undefined,
      sale_id: isGumroad ? "sale_xyz" : undefined,
      issued_at: new Date(now - 30 * 60_000).toISOString(),
      revoked_at: null,
      activations: [
        { id: 1, machine_id: "MAC-A1B2C3D4E5F6", activated_at: new Date(now - 10 * 60_000).toISOString() },
        { id: 2, machine_id: "MAC-Z9Y8X7W6V5U4", activated_at: new Date(now - 4 * 86400_000).toISOString() },
      ],
      audit: [
        { id: "1", actor_email: ADMIN_EMAIL, action: "license.issue_comp",
          details: JSON.stringify({ email: "alice@example.com", max_uses: 2 }),
          created_at: new Date(now - 30 * 60_000).toISOString() },
      ],
    };
  }

  return undefined;
};
