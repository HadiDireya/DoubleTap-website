export const trialsFixture = (path) => {
  if (path.startsWith("/admin/trials/")) {
    const suffix = path.slice("/admin/trials/".length).split("?")[0];
    // Action endpoints (PATCH /:id/extend, /:id/terminate) — return ok.
    if (suffix.includes("/")) return { ok: true, deadline: new Date().toISOString() };
    // Detail endpoint
    const id = decodeURIComponent(suffix);
    const now = Date.now();
    return {
      machine_id: id,
      started_at: new Date(now - 4 * 86400_000).toISOString(),
      deadline: new Date(now + 10 * 86400_000).toISOString(),
      status: "active",
      converted_license_key: null,
      converted_at: null,
      activations: [],
      audit: [],
      now: new Date(now).toISOString(),
    };
  }
  if (path.startsWith("/admin/trials")) {
    const now = Date.now();
    const rows = [
      { machine_id: "MAC-AAAA1111-BBBB2222-CCCC3333", started_at: new Date(now - 1 * 86400_000).toISOString(),
        deadline: new Date(now + 13 * 86400_000).toISOString(), converted_license_key: null, converted_at: null,
        status: "active" },
      { machine_id: "MAC-DEAD1111-BEEF2222-CAFE3333", started_at: new Date(now - 6 * 86400_000).toISOString(),
        deadline: new Date(now + 8 * 86400_000).toISOString(), converted_license_key: "LZ-AB12-CD34-EF56-GH78",
        converted_at: new Date(now - 5 * 86400_000).toISOString(), status: "active" },
      { machine_id: "MAC-OLD1234-EXPIRED-99887766", started_at: new Date(now - 22 * 86400_000).toISOString(),
        deadline: new Date(now - 8 * 86400_000).toISOString(), converted_license_key: null, converted_at: null,
        status: "expired" },
      { machine_id: "MAC-CONVERTED-77665544", started_at: new Date(now - 30 * 86400_000).toISOString(),
        deadline: new Date(now - 16 * 86400_000).toISOString(),
        converted_license_key: "LZ-XY34-WV56-UV78-TS90",
        converted_at: new Date(now - 18 * 86400_000).toISOString(), status: "expired" },
    ];
    return { rows, page: 1, limit: 50, total: rows.length, now: new Date(now).toISOString() };
  }
  return undefined;
};
