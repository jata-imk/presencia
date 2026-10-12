import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client.js";
import { accounts, sessions, users, verifications } from "../db/schema.js";
import { env } from "../env.js";
import { correoDeCuentaExistente, correoDeVerificacion } from "../mailer/auth-emails.js";
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
      displayName: {
        type: "string",
        required: false,
        input: true,
      },
      timezone: {
        type: "string",
        required: false,
        input: false,
        defaultValue: "America/Mexico_City",
      },
      // Gate de onboarding (F4). input: false — se sella con
      // POST /api/me/complete-onboarding, no directo por el cliente.
      onboardingCompletedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  // F10.8.4: el límite de intentos también en dev (Better Auth lo prende solo
  // en producción). Paridad: la pantalla de "demasiados intentos" del login se
  // prueba igual que se ve en prod. 3 intentos de entrar cada 10 s por IP.
  rateLimit: { enabled: true },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    // Con la verificación obligatoria, registrarse con un correo que ya tiene
    // cuenta responde igual que uno nuevo: la pantalla no revela qué correos
    // están registrados. El aviso le llega al dueño (F10.8.4). Si esa cuenta
    // nunca se confirmó (el link se perdió o venció), lo útil es un link
    // nuevo: "entra con tu contraseña" la dejaría en el 403 de confirmar.
    onExistingUserSignUp: async ({ user }) => {
      if (!user.emailVerified) {
        await auth.api.sendVerificationEmail({
          body: { email: user.email, callbackURL: `${env.WEB_URL}/chats` },
        });
        return;
      }
      await sendMail({ to: user.email, ...correoDeCuentaExistente(user) });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({ to: user.email, ...correoDeVerificacion(user, url) });
    },
  },
});

export type SessionUser = typeof auth.$Infer.Session.user;
