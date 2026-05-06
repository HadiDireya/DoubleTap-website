// Demo-mode router. When /admin/?demo=1 is loaded on localhost, apiFetch
// consults this module before hitting the network. Returns `undefined` for
// any path that isn't fixtured so non-stubbed routes still surface real
// errors during development.
//
// Per-resource fixtures live in ./fixtures/<name>.js and are chained below.
// Adding a new resource: drop a file exporting `<name>Fixture(path) → data |
// undefined`, then import + add to the chain.

import { meFixture } from "./fixtures/me.js";
import { licensesFixture } from "./fixtures/licenses.js";
import { backupFixture } from "./fixtures/backup.js";
import { usersFixture } from "./fixtures/users.js";
import { trialsFixture } from "./fixtures/trials.js";
import { activationsFixture } from "./fixtures/activations.js";
import { feedbackFixture } from "./fixtures/feedback.js";
import { auditFixture } from "./fixtures/audit.js";
import { settingsFixture } from "./fixtures/settings.js";
import { dashboardFixture } from "./fixtures/dashboard.js";

const FIXTURES = [
  meFixture,
  licensesFixture,
  backupFixture,
  usersFixture,
  trialsFixture,
  activationsFixture,
  feedbackFixture,
  auditFixture,
  settingsFixture,
  dashboardFixture,
];

export const demoFixture = (path) => {
  for (const fixture of FIXTURES) {
    const result = fixture(path);
    if (result !== undefined) return result;
  }
  return undefined;
};
