import { z } from "zod";

// Validación fail-fast del entorno (se invoca en main.ts antes de crear la app).
// DATABASE_URL (rol owner) es solo para migraciones vía drizzle-kit; el runtime
// usa APP_DATABASE_URL con el rol presencia_app, sujeto a RLS (ADR-003).
const envSchema = z
  .object({
    APP_DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    WEB_URL: z.url(),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    DEEPSEEK_API_KEY: z.string().min(1).optional(),
    MINIMAX_API_KEY: z.string().min(1).optional(),
    MINIMAX_BASE_URL: z.url().default("https://api.minimax.io/v1"),
    KIMI_API_KEY: z.string().min(1).optional(),
    KIMI_BASE_URL: z.url().default("https://api.moonshot.ai/v1"),
    // Modelo default con formato "proveedor:modelo" (ADR-004). Cambiar de
    // proveedor es cambiar esta variable y reiniciar el proceso.
    AI_MODEL: z
      .string()
      .regex(/^(google|openai|anthropic|deepseek|minimax|kimi):.+$/, {
        message:
          "AI_MODEL debe tener formato proveedor:modelo (google|openai|anthropic|deepseek|minimax|kimi)",
      })
      .default("google:gemini-3.5-flash"),
    ZEPTOMAIL_TOKEN: z.string().min(1),
    MAIL_FROM: z.email(),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .superRefine((value, ctx) => {
    // Fail-fast: el proveedor del modelo default debe tener su API key al boot.
    const keyByProvider = {
      google: value.GOOGLE_GENERATIVE_AI_API_KEY,
      openai: value.OPENAI_API_KEY,
      anthropic: value.ANTHROPIC_API_KEY,
      deepseek: value.DEEPSEEK_API_KEY,
      minimax: value.MINIMAX_API_KEY,
      kimi: value.KIMI_API_KEY,
    } as const;
    const provider = value.AI_MODEL.split(":")[0] as keyof typeof keyByProvider;
    if (!keyByProvider[provider]) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_MODEL"],
        message: `AI_MODEL usa el proveedor "${provider}" pero falta su API key en el entorno`,
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
