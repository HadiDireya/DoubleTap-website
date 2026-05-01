import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { getDb } from "./db/client";
import type { Env } from "./env";

export const createAuth = (env: Env) =>
  betterAuth({
    database: drizzleAdapter(getDb(env), { provider: "sqlite" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.API_URL,
    basePath: "/auth",
    trustedOrigins: [env.APP_URL, `https://www.${env.APP_URL.replace(/^https?:\/\//, "")}`],
    socialProviders: {
      apple: {
        clientId: env.APPLE_CLIENT_ID,
        clientSecret: env.APPLE_CLIENT_SECRET,
      },
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
