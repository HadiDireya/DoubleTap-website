export type Env = {
  DB: D1Database;
  LICENSE_DB: D1Database;
  APP_URL: string;
  API_URL: string;
  BETTER_AUTH_SECRET: string;
  RESEND_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GUMROAD_PRODUCT_ID: string;
  // Shared secret for the Gumroad ping receiver at /gumroad/webhook/:secret.
  // Long, random, treated as sensitive (it appears in URL paths so any
  // request log captures it — keep tail logs locked down). Optional so
  // the route 404s cleanly when unconfigured.
  GUMROAD_WEBHOOK_SECRET?: string;
  // Fine-grained PAT with `actions: read+write` on the
  // HadiDireya/doubletap-license-backups repo, used by /admin/backup/* to
  // dispatch the workflow and read run history. Optional so the admin
  // panel still loads without it; the dashboard widget surfaces an
  // unconfigured state when this is missing.
  BACKUP_GH_TOKEN?: string;
  DEV?: string;
};
