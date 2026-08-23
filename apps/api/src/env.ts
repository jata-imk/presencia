import { z } from "zod";
import {
  DEFAULT_MODEL_ID,
  MODEL_TIER_ENV_VARS,
  parseModelId,
  PROVIDERS,
} from "./ai/provider-registry.js";

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
    // Routing por tarea (F4.5, addendum ADR-004): tiers opcionales sobre
    // AI_MODEL — MODEL_BY_TASK (provider-registry.ts) mapea cada AiTaskKind
    // a una de estas 3. Sin setear, la tarea cae a AI_MODEL.
    AI_MODEL_CHAT: z.string().optional(),
    AI_MODEL_UTILITY: z.string().optional(),
    AI_MODEL_ADAPT: z.string().optional(),
    ZEPTOMAIL_TOKEN: z.string().min(1),
    MAIL_FROM: z.email(),
    PORT: z.coerce.number().int().positive().default(3000),
    // Publicación (F6, ADR-009). "fake" es el provider permanente de dev/test
    // (FakePublishingProvider, in-memory) — "postfast" habla con la API real
    // y necesita POSTFAST_API_KEY (workspace único y global, ver ADR-009
    // addendum). Default a "fake": levantar el repo sin la key no debe
    // tronar el boot.
    PUBLISHING_PROVIDER: z.enum(["fake", "postfast"]).default("fake"),
    POSTFAST_API_KEY: z.string().min(1).optional(),
    POSTFAST_BASE_URL: z.url().default("https://api.postfa.st"),
  })
  .superRefine((value, ctx) => {
    // Fail-fast: toda var de modelo (AI_MODEL + los 3 tiers opcionales) debe
    // tener formato válido y su proveedor debe tener API key al boot.
    // Formato e inventario vienen de la tabla PROVIDERS.
    const validateModelEnv = (path: string, modelId: string) => {
      try {
        const { provider } = parseModelId(modelId);
        const envKey = PROVIDERS[provider].envKey;
        if (!(value as Record<string, unknown>)[envKey]) {
          ctx.addIssue({
            code: "custom",
            path: [path],
            message: `${path} usa el proveedor "${provider}" pero falta ${envKey} en el entorno`,
          });
        }
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    validateModelEnv("AI_MODEL", value.AI_MODEL);
    // Los tiers son opcionales: sin setear, la tarea cae a AI_MODEL (ya
    // validado arriba) y no hay nada más que revisar aquí.
    for (const path of MODEL_TIER_ENV_VARS) {
      const modelId = value[path];
      if (modelId) validateModelEnv(path, modelId);
    }

    // Fail-fast (mismo criterio que el modelo de IA): pedir el provider real
    // sin key es un boot roto, no un fallback silencioso a datos falsos.
    if (value.PUBLISHING_PROVIDER === "postfast" && !value.POSTFAST_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["POSTFAST_API_KEY"],
        message: 'PUBLISHING_PROVIDER="postfast" requiere POSTFAST_API_KEY en el entorno',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
