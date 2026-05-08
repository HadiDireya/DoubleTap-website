import { ADMIN_EMAIL } from "../../config.js";

export const settingsFixture = (path) => {
  if (path !== "/admin/settings") return undefined;
  return {
    admins: [{ email: ADMIN_EMAIL, source: "code" }],
    secrets: [
      { name: "BETTER_AUTH_SECRET", configured: true },
      { name: "RESEND_API_KEY", configured: true },
      { name: "GOOGLE_CLIENT_ID", configured: true },
      { name: "GOOGLE_CLIENT_SECRET", configured: true },
      { name: "GUMROAD_PRODUCT_ID", configured: true },
      { name: "BACKUP_GH_TOKEN", configured: false },
    ],
    maintenance: { enabled: false, message: null, updated_at: null, unimplemented: true },
    feature_flags: [],
  };
};
