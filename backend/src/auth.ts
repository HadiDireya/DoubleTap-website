import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { getDb } from "./db/client";
import { buildOrigins } from "./lib/origins";
import type { Env } from "./env";

export const createAuth = (env: Env) =>
  betterAuth({
    database: drizzleAdapter(getDb(env), { provider: "sqlite" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.API_URL,
    basePath: "/auth",
    // Better Auth keeps its own origin allow-list and would otherwise 403
    // sign-in POSTs from a localhost frontend even though CORS already
    // let the request through. Sharing buildOrigins with index.ts means
    // the two layers can't drift.
    trustedOrigins: buildOrigins(env),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const resend = new Resend(env.RESEND_API_KEY);
          await resend.emails.send({
            from: "DoubleTap <noreply@doubletap-app.com>",
            to: email,
            subject: "Sign in to DoubleTap",
            html: `<p>Click <a href="${url}">here</a> to sign in. This link expires in 5 minutes.</p>`,
          });
        },
      }),
    ],
  });
