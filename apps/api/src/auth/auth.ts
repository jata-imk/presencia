import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client.js";
import { accounts, sessions, users, verifications } from "../db/schema.js";
import { env } from "../env.js";
import { sendMail } from "../mailer/mailer.js";

// Instancia plana (sin DI): la CLI de Better Auth y toNodeHandler la
// importan directo. ADR-007: Better Auth es la plomería, la UI es nuestra.
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  // Postgres genera los uuid (defaultRandom en el schema); el adapter no
  // manda id porque supportsUUIDs es true con provider "pg".
  advanced: { database: { generateId: "uuid" } },
  user: {
    additionalFields: {
      timezone: {
        type: "string",
        required: false,
        input: false,
        defaultValue: "America/Mexico_City",
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({
        to: user.email,
        subject: "Confirma tu correo para empezar a usar Presencia",
        html: `
          <p>Hola${user.name ? ` ${user.name}` : ""}:</p>
          <p>Gracias por registrarte en Presencia. Confirma tu correo para activar tu cuenta:</p>
          <p><a href="${url}">Confirmar mi correo</a></p>
          <p>Si tú no creaste esta cuenta, ignora este mensaje.</p>
        `,
      });
    },
  },
});

export type SessionUser = typeof auth.$Infer.Session.user;
