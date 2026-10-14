import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { db } from "../db/client.js";
import { accounts, sessions, users, verifications } from "../db/schema.js";
import { env } from "../env.js";
import {
  correoDeCuentaExistente,
  correoDeRecuperacion,
  correoDeVerificacion,
} from "../mailer/auth-emails.js";
import { sendMail } from "../mailer/mailer.js";
import { TRUSTED_PROXIES } from "./proxies.js";

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
  advanced: {
    database: { generateId: "uuid" },
    // La IP real detrás de Cloudflare y nginx, para que el límite de intentos
    // sea por cliente y no uno solo para todos (ver proxies.ts).
    ipAddress: { trustedProxies: TRUSTED_PROXIES },
  },
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
    // F10.8.4: cambiar la contraseña con el código cierra las demás sesiones
    // (alguien que tenía la contraseña vieja deja de estar dentro). La
    // pantalla inicia una sesión nueva justo después.
    revokeSessionsOnPasswordReset: true,
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
  // F10.8.4: recuperar la contraseña con un código de 6 dígitos (Auth
  // Flow.html). Del plugin solo se usan "pedir el código" y "cambiar la
  // contraseña con el código"; el resto se apaga en disabledPaths.
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      // Con hash, no en claro: quien pudiera leer `verifications` (un
      // respaldo filtrado) podría pedir un código y tomar cualquier cuenta.
      storeOTP: "hashed",
      allowedAttempts: 3,
      // Entrar con código no es un flujo nuestro: que nunca cree cuentas.
      disableSignUp: true,
      sendVerificationOTP: ({ email, otp, type }) => {
        if (type !== "forget-password") return Promise.resolve();
        // Sin esperar el envío, y su fallo no llega al navegador: a un correo
        // sin cuenta no se manda nada, así que esperarlo (cientos de ms) o
        // devolver un 500 solo para los registrados diría cuáles existen.
        sendMail({ to: email, ...correoDeRecuperacion(email, otp) }).catch((error: unknown) => {
          console.error("[auth] No se pudo mandar el código de recuperación:", error);
        });
        return Promise.resolve();
      },
    }),
  ],
  // Lo que el plugin trae y no usamos. check-verification-otp, además, dice
  // "usuario no encontrado" para un correo sin cuenta: lo averiguaría con una
  // sola llamada. El código se valida al cambiar la contraseña
  // (reset-password), que a la primera responde igual con o sin cuenta.
  // Queda una diferencia que no se cierra sin reescribir el plugin: tras
  // varios códigos malos, un correo registrado responde "demasiados intentos"
  // y uno sin cuenta sigue en "código inválido". Averiguarlo así cuesta
  // mandarle al dueño un correo real y pasar por el límite de intentos.
  disabledPaths: [
    "/email-otp/check-verification-otp",
    "/email-otp/send-verification-otp",
    "/email-otp/verify-email",
    "/sign-in/email-otp",
    "/forget-password/email-otp",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
  ],
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendMail({ to: user.email, ...correoDeVerificacion(user, url) });
    },
  },
});

export type SessionUser = typeof auth.$Infer.Session.user;
