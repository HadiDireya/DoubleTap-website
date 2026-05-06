// Mix in: a shared-machine pair (same MAC across two licenses), a
// hot-key (same key activated 3× recently from different machines),
// a Gumroad row (no email), a revoked-license activation, and an
// orphan (stale activation pointing at a Lahza row that no longer
// exists in LICENSE_DB.licenses — cleanup race / hard-delete).
export const activationsFixture = (path) => {
  if (!path.startsWith("/admin/activations")) return undefined;

  const now = Date.now();
  const sharedMac = "MAC-AAAA1111-BBBB2222-CCCC3333";
  const hotKey = "LZ-XY34-WV56-UV78-TS90";
  const revokedAt = new Date(now - 1 * 86400_000).toISOString();
  const rows = [
    { id: 51, license_key: "LZ-AB12-CD34-EF56-GH78", machine_id: sharedMac,
      activated_at: new Date(now - 5 * 60_000).toISOString(),
      email: "alice@example.com", source: "lahza",
      license_revoked_at: null, license_missing: false, shared_count: 2 },
    { id: 50, license_key: hotKey, machine_id: "MAC-RAPID-A1B2",
      activated_at: new Date(now - 25 * 60_000).toISOString(),
      email: "charlie@example.com", source: "lahza",
      license_revoked_at: null, license_missing: false, shared_count: 1 },
    { id: 49, license_key: hotKey, machine_id: "MAC-RAPID-C3D4",
      activated_at: new Date(now - 2 * 3600_000).toISOString(),
      email: "charlie@example.com", source: "lahza",
      license_revoked_at: null, license_missing: false, shared_count: 1 },
    { id: 48, license_key: hotKey, machine_id: "MAC-RAPID-E5F6",
      activated_at: new Date(now - 5 * 3600_000).toISOString(),
      email: "charlie@example.com", source: "lahza",
      license_revoked_at: null, license_missing: false, shared_count: 1 },
    { id: 47, license_key: "LZ-FRIEND-OF-ALICE-7890", machine_id: sharedMac,
      activated_at: new Date(now - 26 * 3600_000).toISOString(),
      email: "alice2@example.com", source: "lahza",
      license_revoked_at: null, license_missing: false, shared_count: 2 },
    { id: 46, license_key: "ABCD1234-EFGH5678", machine_id: "MAC-GUMROAD-LEGACY",
      activated_at: new Date(now - 4 * 86400_000).toISOString(),
      email: null, source: "gumroad",
      license_revoked_at: null, license_missing: false, shared_count: 1 },
    { id: 45, license_key: "LZ-DEAD-BEEF-CAFE-FOOD", machine_id: "MAC-REVOKED-1234",
      activated_at: new Date(now - 6 * 86400_000).toISOString(),
      email: "bob@example.com", source: "lahza",
      license_revoked_at: revokedAt, license_missing: false, shared_count: 1 },
    { id: 43, license_key: "LZ-GHOST-DELETED-FROM-DB", machine_id: "MAC-ORPHAN-7777",
      activated_at: new Date(now - 8 * 86400_000).toISOString(),
      email: null, source: "lahza",
      license_revoked_at: null, license_missing: true, shared_count: 1 },
    { id: 44, license_key: "LZ-COMP-9XYZ8-WV7TU", machine_id: "MAC-PRESS-RIG",
      activated_at: new Date(now - 9 * 86400_000).toISOString(),
      email: "press@example.com", source: "comp",
      license_revoked_at: null, license_missing: false, shared_count: 1 },
  ];
  return {
    rows, page: 1, limit: 50, total: rows.length,
    stats: { total_activations: 178, shared_machines: 2, hot_licenses: 1 },
  };
};
