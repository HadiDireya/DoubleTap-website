import { ADMIN_EMAIL } from "../../config.js";

export const meFixture = (path) => {
  if (path === "/admin/me") {
    return { email: ADMIN_EMAIL, name: "Hadi (demo)" };
  }
  return undefined;
};
