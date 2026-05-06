export const dashboardFixture = (path) => {
  if (!path.startsWith("/admin/dashboard")) return undefined;

  const days = (n) => {
    const out = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      out.push({
        date: d.toISOString().slice(0, 10),
        lahza: Math.max(0, Math.round(2 + Math.sin(i / 3) * 4)),
        comp: i % 7 === 0 ? 1 : 0,
      });
    }
    return out;
  };
  const now = Date.now();
  return {
    range: "30d",
    generatedAt: new Date(now).toISOString(),
    kpis: {
      activeLicenses: { total: 137, lahza: 89, gumroad: 48 },
      activeTrials: 23,
      issuedInPeriod: { total: 41, lahza: 32, gumroad: 9, delta: 0.18 },
      revokedInPeriod: { total: 3, delta: -0.4 },
    },
    bottomRow: {
      conversion: { started: 60, converted: 19, pct: 19 / 60 },
      users: { total: 412, new: 27 },
      utilisation: { activations: 178, avgPerLicense: 2.0 },
      trialsStarted: 60,
    },
    issuanceSeries: days(30),
    feed: [
      { kind: "license", at: new Date(now - 5 * 60_000).toISOString(),
        type: "license.issued", licenseKey: "LZ-AB12-CD34", email: "alice@example.com", source: "lahza" },
      { kind: "license", at: new Date(now - 45 * 60_000).toISOString(),
        type: "activation.added", licenseKey: "LZ-AB12-CD34", email: "alice@example.com",
        source: "lahza", detail: "MAC-A1B2C3D4E5" },
      { kind: "license", at: new Date(now - 3 * 3600_000).toISOString(),
        type: "license.revoked", licenseKey: "LZ-COMP-99XY", email: "bob@example.com", source: "comp" },
      { kind: "feedback", at: new Date(now - 6 * 3600_000).toISOString(),
        postId: "p1", title: "F-row triggers should support left/right modifiers", type: "feature" },
      { kind: "license", at: new Date(now - 18 * 3600_000).toISOString(),
        type: "license.issued", licenseKey: "LZ-XY34-WV56", email: "charlie@example.com", source: "lahza" },
      { kind: "license", at: new Date(now - 26 * 3600_000).toISOString(),
        type: "activation.added", licenseKey: "LZ-XY34-WV56", email: "charlie@example.com",
        source: "lahza", detail: "MAC-Z9Y8X7W6V5" },
    ],
  };
};
