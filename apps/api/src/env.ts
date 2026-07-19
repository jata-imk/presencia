import { z } from "zod";

// Validación fail-fast del entorno (se invoca en main.ts antes de crear la app).
// DATABASE_URL (rol owner) es solo para migraciones vía drizzle-kit; el runtime
// usa APP_DATABASE_URL con el rol presencia_app, sujeto a RLS (ADR-003).
const envSchema = z.object({
  APP_DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_URL: z.url(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
  ZEPTOMAIL_TOKEN: z.string().min(1),
  MAIL_FROM: z.email(),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
