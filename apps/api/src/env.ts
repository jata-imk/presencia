import { z } from "zod";
import { DEFAULT_MODEL_ID, parseModelId, PROVIDERS } from "./ai/provider-registry.js";

// Validación fail-fast del entorno (se invoca en main.ts antes de crear la app).
// DATABASE_URL (rol owner) es solo para migraciones vía drizzle-kit; el runtime
// usa APP_DATABASE_URL con el rol presencia_app, sujeto a RLS (ADR-003).
const envSchema = z
  .object({
    APP_DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    WEB_URL: z.url(),
    // API keys por proveedor de IA (ADR-004): todas opcionales; solo la del
    // proveedor de AI_MODEL es obligatoria (lo valida el superRefine abajo).
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    DEEPSEEK_API_KEY: z.string().min(1).optional(),
    MINIMAX_API_KEY: z.string().min(1).optional(),
    MINIMAX_BASE_URL: z.url().optional(),
    KIMI_API_KEY: z.string().min(1).optional(),
    KIMI_BASE_URL: z.url().optional(),
    // Modelo default con formato "proveedor:modelo" (ADR-004). Cambiar de
    // proveedor es cambiar esta variable y reiniciar el proceso. El formato
    // y el inventario de proveedores los valida parseModelId (fuente única).
    AI_MODEL: z.string().default(DEFAULT_MODEL_ID),
    ZEPTOMAIL_TOKEN: z.string().min(1),
    MAIL_FROM: z.email(),
    PORT: z.coerce.number().int().positive().default(3000),
  })
  .superRefine((value, ctx) => {
    // Fail-fast: AI_MODEL debe tener formato válido y su proveedor debe tener
    // API key al boot. Formato e inventario vienen de la tabla PROVIDERS.
    try {
      const { provider } = parseModelId(value.AI_MODEL);
      const envKey = PROVIDERS[provider].envKey;
      if (!(value as Record<string, unknown>)[envKey]) {
        ctx.addIssue({
          code: "custom",
          path: ["AI_MODEL"],
          message: `AI_MODEL usa el proveedor "${provider}" pero falta ${envKey} en el entorno`,
        });
      }
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["AI_MODEL"],
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
