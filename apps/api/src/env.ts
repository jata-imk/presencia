import { z } from "zod";
import { parseSimulateDown } from "./ai/fallback.js";
import { imageGeneratorIds } from "./images/image-models.js";
import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_ID,
  DEFAULT_TRENDS_MODEL_ID,
  MODEL_TIER_ENV_VARS,
  parseModelChain,
  PROVIDERS,
  SEARCH_PROVIDER,
} from "./ai/provider-registry.js";

// Validación fail-fast del entorno (se invoca en main.ts antes de crear la app).
// DATABASE_URL (rol owner) es solo para migraciones vía drizzle-kit; el runtime
// usa APP_DATABASE_URL con el rol presencia_app, sujeto a RLS (ADR-003).
const envSchema = z
  .object({
    APP_DATABASE_URL: z.string().min(1),
    // Conexión de pg-boss con presencia_jobs, dueño único del schema `pgboss`
    // (migración 0020, addendum ADR-008). Aparte de APP_DATABASE_URL a
    // propósito: sus migraciones internas hacen DDL de dueño, y si el rol que
    // conecta no es el dueño de las tablas el arranque aborta con
    // "must be owner of table job".
    JOBS_DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    WEB_URL: z.url(),
    // API keys por proveedor de IA (ADR-004): todas opcionales aquí; la de
    // cada modelo de cada variable AI_MODEL* es obligatoria (lo valida el
    // superRefine abajo; las de imagen, solo con IMAGE_PROVIDER=real).
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    DEEPSEEK_API_KEY: z.string().min(1).optional(),
    MINIMAX_API_KEY: z.string().min(1).optional(),
    MINIMAX_BASE_URL: z.url().optional(),
    KIMI_API_KEY: z.string().min(1).optional(),
    KIMI_BASE_URL: z.url().optional(),
    // F10.7: generadores de imagen. xAI (Grok Imagine) y OpenRouter (Muse y
    // MAI-Image con una sola key; solo imágenes).
    XAI_API_KEY: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_BASE_URL: z.url().optional(),
    // Modelo default con formato "proveedor:modelo" (ADR-004). Cambiar de
    // proveedor es cambiar esta variable y reiniciar el proceso. El formato
    // y el inventario de proveedores los valida parseModelEntry (fuente única), que acepta un `@esfuerzo` opcional (F10.7).
    AI_MODEL: z.string().default(DEFAULT_MODEL_ID),
    // Routing por tarea (F4.5, addendum ADR-004): tiers opcionales sobre
    // AI_MODEL — MODEL_BY_TASK (provider-registry.ts) mapea cada AiTaskKind
    // a una de estas 3. Sin setear, la tarea cae a AI_MODEL.
    AI_MODEL_CHAT: z.string().optional(),
    AI_MODEL_UTILITY: z.string().optional(),
    AI_MODEL_ADAPT: z.string().optional(),
    // Tendencias de Ritmo (F9). No es un tier más de MODEL_BY_TASK: esa tabla
    // mapea tareas a modelos intercambiables, y esta llamada necesita una
    // capacidad concreta —búsqueda con grounding— que hoy solo tiene Google.
    // Sin setear cae a DEFAULT_TRENDS_MODEL_ID, que es de Google — NO a
    // AI_MODEL: apuntar el chat a otro proveedor es una decisión sobre el chat
    // y no debería apagar las tendencias. Si el modelo resuelto no es de
    // Google, el job falla con un motivo escrito en vez de producir tendencias
    // sin fuente.
    AI_MODEL_TRENDS: z.string().optional(),
    // Solo dev (F10.7): proveedores que la cadena de respaldo finge caídos
    // (503), para ver el respaldo en el navegador sin romper nada. Separados
    // por coma: "openai" o "openai,google".
    AI_FALLBACK_SIMULATE: z.string().optional(),
    // F10.8: chats largos. A partir de cuántos tokens de entrada (el contexto
    // del paso más grande del turno) se compacta el tramo viejo con el modelo
    // utility: 40k ≈ 320 unidades ≈ 1% de la cuota Creator por mensaje.
    CHAT_COMPACT_AT_TOKENS: z.coerce.number().int().min(1_000).default(40_000),
    // Techo mecánico: lo más que viaja al modelo aunque el resumen no haya
    // corrido. Estimado (~4 caracteres por token), no exacto.
    CHAT_HISTORY_CAP_TOKENS: z.coerce.number().int().min(2_000).default(120_000),
    // Generación de imágenes (F10, ADR-025). Mismo criterio que
    // AI_MODEL_TRENDS: default propio (DEFAULT_IMAGE_MODEL_ID), nunca AI_MODEL,
    // porque un modelo de texto no dibuja.
    AI_MODEL_IMAGE: z.string().optional(),
    // OBSOLETA desde F10.7: "Probar con otro generador" ofrece los demás de
    // AI_MODEL_IMAGE. Se sigue aceptando para no tumbar un despliegue que la
    // tenga puesta: entra segunda en la lista con un aviso en el log
    // (imageGeneratorIds, images/image-models.ts).
    AI_MODEL_IMAGE_ALT: z.string().optional(),
    // "fake" dibuja un PNG liso sin llamar a nadie: es lo que usan los tests y
    // lo que conviene en dev para probar la card sin gastar. Mismo patrón que
    // PUBLISHING_PROVIDER, pero default "real": generar es el producto, y una
    // instalación nueva que dibuja cuadros grises en silencio engaña.
    IMAGE_PROVIDER: z.enum(["real", "fake"]).default("real"),
    // Solo con el fake: cuánto tarda en "dibujar", para ver y medir el estado
    // "generando" de la card en dev. Un generador real tarda 10-60 s.
    IMAGE_FAKE_DELAY_MS: z.coerce.number().int().min(0).default(0),
    ZEPTOMAIL_TOKEN: z.string().min(1),
    MAIL_FROM: z.email(),
    PORT: z.coerce.number().int().positive().default(3000),
    // Worker de pg-boss (F8, ADR-008). En dev corre DENTRO del proceso de la
    // API: FakePublishingProvider guarda sus posts en memoria, así que un
    // worker aparte tendría un Map vacío y la reconciliación marcaría como
    // fallida toda card programada. En prod el contenedor `app` lo apaga y el
    // contenedor `worker` corre `worker.ts`. No se usa z.coerce.boolean():
    // convierte "false" en true.
    WORKER_INLINE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    // Publicación (F6/F7.5, ADR-009). "fake" es el provider permanente de
    // dev/test (FakePublishingProvider, in-memory); "postfast" y
    // "upload_post" hablan con su API real y cada uno exige SU key (ver el
    // superRefine de abajo). Default a "fake": levantar el repo sin ninguna
    // key no debe tronar el boot.
    PUBLISHING_PROVIDER: z.enum(["fake", "postfast", "upload_post"]).default("fake"),
    POSTFAST_API_KEY: z.string().min(1).optional(),
    POSTFAST_BASE_URL: z.url().default("https://api.postfa.st"),
    UPLOAD_POST_API_KEY: z.string().min(1).optional(),
    // El /api final es parte de la base, no del path: todas las rutas del
    // openapi.json cuelgan de https://api.upload-post.com/api.
    UPLOAD_POST_BASE_URL: z.url().default("https://api.upload-post.com/api"),
    // --- Backup diario (F8.5, ADR-011) ---
    // Opcionales como grupo: sin configurar, el job no se registra y la API
    // arranca igual (en dev nadie tiene bucket). Pero configurado a medias es
    // un error de arranque, no un backup que se salta en silencio: ver el
    // superRefine de abajo.
    S3_ENDPOINT: z.url().optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    // R2 ignora la región pero el SDK exige uno; "auto" es lo que documenta
    // Cloudflare.
    S3_REGION: z.string().min(1).default("auto"),
    // Conexión del pg_dump: rol presencia_backup, con pg_read_all_data +
    // BYPASSRLS (migración 0021) y sin escritura ni DDL. Aparte de
    // APP_DATABASE_URL a propósito — el dump necesita leerlo TODO, y ese poder
    // no tiene por qué vivir en el rol que sirve requests.
    //
    // z.url() y no string(): una URL mal escrita tiene que tronar al arrancar,
    // no a las 08:00 UTC dentro del job, donde con retryLimit 0 fallaría todos
    // los días con la única señal en pgboss.job.
    BACKUP_DATABASE_URL: z.url().optional(),
    // --- Assets de Biblioteca (F10, ADR-011) ---
    // "r2" es el bucket; reusa S3_ENDPOINT y las credenciales del backup, con
    // su propio bucket (privado). "local" guarda en disco y SOLO existe para
    // dev y tests, donde nadie tiene bucket: ADR-011 prohíbe los archivos en
    // el disco del servidor, así que en producción es un error de arranque.
    ASSETS_STORAGE: z.enum(["local", "r2"]).default("local"),
    ASSETS_S3_BUCKET: z.string().min(1).optional(),
    // Relativo al cwd del proceso (apps/api en dev).
    ASSETS_LOCAL_DIR: z.string().min(1).default(".data/assets"),
    NODE_ENV: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    // Fail-fast: toda var de modelo (AI_MODEL + los 3 tiers opcionales) debe
    // tener formato válido y su proveedor debe tener API key al boot.
    // Formato e inventario vienen de la tabla PROVIDERS.
    // El `@esfuerzo` (F10.7) solo vale en modelos de texto: un generador de
    // imágenes no razona, y aceptarlo en silencio haría creer que se aplicó.
    //
    // Desde F10.7 las de texto son cadenas: principal y respaldos separados
    // por coma, y CADA uno necesita su key — un respaldo sin key se
    // descubriría justo el día que se cae el principal. AI_MODEL_IMAGE también
    // es cadena (F10.7 PR5); el ALT, de un solo modelo.
    const validateModelEnv = (
      path: string,
      modelChain: string,
      {
        image = false,
        single = false,
        onlyProvider,
      }: { image?: boolean; single?: boolean; onlyProvider?: string } = {},
    ) => {
      try {
        const entries = parseModelChain(modelChain);
        // El schema compartido acepta `generator` hasta 10: una lista más larga
        // mostraría un "Generador 11" que el pedido rechazaría.
        if (image && entries.length > 10) {
          throw new Error(`${path} acepta hasta 10 generadores`);
        }
        if (single && entries.length > 1) {
          throw new Error(`${path} acepta un solo modelo`);
        }
        for (const { id, provider, reasoning } of entries) {
          if (image && reasoning) {
            throw new Error(`${path} no acepta "@${reasoning}": un modelo de imagen no razona`);
          }
          if (!image && (PROVIDERS[provider] as { imageOnly?: boolean }).imageOnly) {
            throw new Error(`${path}: "${provider}" solo genera imágenes`);
          }
          if (onlyProvider && provider !== onlyProvider) {
            throw new Error(
              `${path} solo acepta modelos de "${onlyProvider}" y "${id}" no lo es: esta tarea necesita búsqueda con grounding`,
            );
          }
          const envKey = PROVIDERS[provider].envKey;
          if (!(value as Record<string, unknown>)[envKey]) {
            ctx.addIssue({
              code: "custom",
              path: [path],
              message: `${path} usa el proveedor "${provider}" pero falta ${envKey} en el entorno`,
            });
          }
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
    // Se valida el id EFECTIVO, no solo el que alguien escribió: sin setear,
    // la variable cae a un modelo de Google, y si no hay key de Google eso es
    // un job que truena cada 6 h con la única señal en `pgboss.job`. Un boot
    // roto se ve; un job que falla en silencio, no.
    validateModelEnv("AI_MODEL_TRENDS", value.AI_MODEL_TRENDS ?? DEFAULT_TRENDS_MODEL_ID, {
      onlyProvider: SEARCH_PROVIDER,
    });

    // El simulador de caídas (F10.7) es para probar la cadena en dev. En
    // producción, un proveedor fingido caído es una caída real del producto.
    // F10.8: con el umbral en o arriba del techo, la compactación nunca se
    // dispararía (el techo deja el contexto por debajo del umbral) y los
    // chats largos perderían lo viejo detrás de la nota en vez de resumirlo.
    if (value.CHAT_COMPACT_AT_TOKENS >= value.CHAT_HISTORY_CAP_TOKENS) {
      ctx.addIssue({
        code: "custom",
        path: ["CHAT_COMPACT_AT_TOKENS"],
        message: "CHAT_COMPACT_AT_TOKENS tiene que ser menor que CHAT_HISTORY_CAP_TOKENS",
      });
    }
    if (value.AI_FALLBACK_SIMULATE) {
      if (value.NODE_ENV === "production") {
        ctx.addIssue({
          code: "custom",
          path: ["AI_FALLBACK_SIMULATE"],
          message: "AI_FALLBACK_SIMULATE no se permite en producción",
        });
      }
      for (const provider of parseSimulateDown(value.AI_FALLBACK_SIMULATE)) {
        if (!Object.hasOwn(PROVIDERS, provider)) {
          ctx.addIssue({
            code: "custom",
            path: ["AI_FALLBACK_SIMULATE"],
            message: `AI_FALLBACK_SIMULATE: "${provider}" no es un proveedor (${Object.keys(PROVIDERS).join(", ")})`,
          });
        }
      }
    }
    // Mismo razonamiento para las imágenes: sin setear cae a Google, y sin su
    // key la primera generación truena dentro de un job. Con el fake no se
    // llama a nadie, así que no hay key que exigir.
    if (value.IMAGE_PROVIDER === "real") {
      validateModelEnv("AI_MODEL_IMAGE", value.AI_MODEL_IMAGE ?? DEFAULT_IMAGE_MODEL_ID, {
        image: true,
      });
      // El ALT viejo se suma a la lista (imageGeneratorIds): cuenta para el tope.
      if (
        value.AI_MODEL_IMAGE_ALT &&
        imageGeneratorIds(value.AI_MODEL_IMAGE, value.AI_MODEL_IMAGE_ALT).length > 10
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["AI_MODEL_IMAGE_ALT"],
          message: "AI_MODEL_IMAGE más AI_MODEL_IMAGE_ALT pasan de 10 generadores",
        });
      }
      if (value.AI_MODEL_IMAGE_ALT)
        validateModelEnv("AI_MODEL_IMAGE_ALT", value.AI_MODEL_IMAGE_ALT, {
          image: true,
          single: true,
        });
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
    if (value.PUBLISHING_PROVIDER === "upload_post" && !value.UPLOAD_POST_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["UPLOAD_POST_API_KEY"],
        message: 'PUBLISHING_PROVIDER="upload_post" requiere UPLOAD_POST_API_KEY en el entorno',
      });
    }

    // El backup es todo o nada. Media configuración sería lo peor de los dos
    // mundos: el operador cree que hay respaldo y el job no se registra.
    //
    // Desde F10 el endpoint y las credenciales también los usa el bucket de
    // assets, así que tenerlos no significa "quiero backup": lo que lo pide es
    // el bucket del backup o su conexión.
    const backupVars = [
      "S3_ENDPOINT",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "BACKUP_DATABASE_URL",
    ] as const;
    const backupSet = backupVars.filter((name) => value[name]);
    const wantsBackup = Boolean(value.S3_BUCKET || value.BACKUP_DATABASE_URL);
    if (wantsBackup && backupSet.length < backupVars.length) {
      const missing = backupVars.filter((name) => !value[name]);
      for (const name of missing) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `El backup diario se configura completo o no se configura: falta ${name} (hay ${backupSet.join(", ")})`,
        });
      }
    }

    // Assets: con R2, el bucket y las credenciales tienen que estar. En
    // producción, además, R2 es la única opción (ADR-011): un deploy que
    // olvidó la variable guardaría las imágenes en el disco del contenedor,
    // que se pierde en el siguiente `up -d`.
    if (value.ASSETS_STORAGE === "r2") {
      for (const name of [
        "ASSETS_S3_BUCKET",
        "S3_ENDPOINT",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ] as const) {
        if (!value[name]) {
          ctx.addIssue({
            code: "custom",
            path: [name],
            message: `ASSETS_STORAGE="r2" requiere ${name} en el entorno`,
          });
        }
      }
    } else if (value.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["ASSETS_STORAGE"],
        message:
          'En producción los assets van al bucket (ADR-011): configura ASSETS_STORAGE="r2" y ASSETS_S3_BUCKET',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
