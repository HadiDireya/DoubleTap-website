export type Env = {
  DB: D1Database;
  LICENSE_DB: D1Database;
  APP_URL: string;
  API_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  APPLE_CLIENT_ID: string;
  APPLE_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GUMROAD_PRODUCT_ID: string;
  // Fine-grained PAT with `actions: read+write` on the
  // HadiDireya/doubletap-license-backups repo, used by /admin/backup/* to
  // dispatch the workflow and read run history. Optional so the admin
  // panel still loads without it; the dashboard widget surfaces an
  // unconfigured state when this is missing.
  BACKUP_GH_TOKEN?: string;
  DEV?: string;
};
