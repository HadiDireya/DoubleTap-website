export const usersFixture = (path) => {
  if (path.startsWith("/admin/users/")) {
    const id = decodeURIComponent(path.slice("/admin/users/".length).split("?")[0]);
    const now = Date.now();
    return {
      id,
      name: "Alice Demo",
      email: "alice@example.com",
      email_verified: true,
      image: null,
      created_at: new Date(now - 90 * 86400_000).toISOString(),
      updated_at: new Date(now - 5 * 86400_000).toISOString(),
      licenses: {
        gumroad: [
          { license_key: "GR-OLD1234-EFGH5678", product_id: "abc", sale_id: "sale_old",
            issued_at: new Date(now - 60 * 86400_000).toISOString() },
        ],
        lahza: [
          { license_key: "LZ-AB12-CD34-EF56-GH78", email: "alice@example.com",
            max_uses: 2, tx_reference: "dt_demo", issued_at: new Date(now - 14 * 86400_000).toISOString(),
            revoked_at: null, active_activations: 1 },
        ],
      },
      feedback: {
        total: 3,
        recent: [
          { id: "p1", type: "feature", title: "Per-app trigger overrides", status: "suggested",
            created_at: new Date(now - 7 * 86400_000).toISOString() },
        ],
      },
      audit: [],
    };
  }
  if (path.startsWith("/admin/users")) {
    const now = Date.now();
    const rows = [
      { id: "u_alice", name: "Alice Demo", email: "alice@example.com", email_verified: true,
        image: null, created_at: new Date(now - 90 * 86400_000).toISOString(), gumroad_license_count: 1 },
      { id: "u_bob", name: "Bob Tester", email: "bob@example.com", email_verified: true,
        image: null, created_at: new Date(now - 30 * 86400_000).toISOString(), gumroad_license_count: 0 },
      { id: "u_charlie", name: "Charlie Recent", email: "charlie@example.com", email_verified: false,
        image: null, created_at: new Date(now - 2 * 86400_000).toISOString(), gumroad_license_count: 0 },
    ];
    return { rows, page: 1, limit: 50, total: rows.length };
  }
  return undefined;
};
