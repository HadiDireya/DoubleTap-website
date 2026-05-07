// Single source of truth for the origin allow-list. The Hono CORS
// middleware in src/index.ts and Better Auth's `trustedOrigins` in
// src/auth.ts both need the same set: prod apex + www variant, and (only
// when DEV === "true") localhost on the static-site dev port. Drift between
// the two used to mean a 403 from one layer even though the other was OK.
//
// APP_URL is assumed to be the apex (no www). The www variant is derived
// from it so the prod hostname only has to be set in one place.
export const buildOrigins = (env: { APP_URL: string; DEV?: string }): string[] => {
  const bare = env.APP_URL.replace(/^https?:\/\//, "");
  const list = [env.APP_URL, `https://www.${bare}`];
  if (env.DEV === "true") {
    list.push("http://localhost:8000", "http://127.0.0.1:8000");
  }
  return list;
};
