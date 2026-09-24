import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { MODOS_ESTRATEGIA } from "@presencia/shared";
import { AI_TASK_KINDS } from "../ai/provider-registry.js";

// Implementa docs/reference/modelo-de-datos.md (aprobado 2026-07-18).
// RLS (enable/force, policies, roles) vive en la migración custom
// drizzle/0001_rls.sql — drizzle-kit no genera FORCE ni roles.

// ── Enums ────────────────────────────────────────────────────────────

export const voiceRegister = pgEnum("voice_register", [
  "neutro_profesional",
  "informal",
  "de_barrio",
  "tecnico",
  "profesional",
]);

export const messageRole = pgEnum("message_role", ["user", "assistant", "system", "tool"]);

export const channel = pgEnum("channel", ["web", "telegram", "whatsapp"]);

export const publicationArchetype = pgEnum("publication_archetype", [
  "visual_first",
  "video_script",
  "text_first",
]);

export const socialNetwork = pgEnum("social_network", [
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "threads",
  "x",
]);

export const cardStatus = pgEnum("card_status", [
  "draft",
  "scheduled",
  "published",
  "canceled",
  "failed",
]);

export const assetSource = pgEnum("asset_source", ["generated", "uploaded"]);

export const channelLinkStatus = pgEnum("channel_link_status", ["pending", "active", "revoked"]);

export const socialAccountStatus = pgEnum("social_account_status", [
  "active",
  "disconnected",
  "error",
]);

// Fuente única de verdad: AI_TASK_KINDS (provider-registry.ts, F4.5). El
// call site declara su tarea; MODEL_BY_TASK la mapea a un tier de modelo.
export const aiTaskKind = pgEnum("ai_task_kind", AI_TASK_KINDS);

export const creditReason = pgEnum("credit_reason", [
  "monthly_grant",
  "cycle_expiration",
  "chat_message",
  "idea_generation",
  "multi_adapt",
  "image_generation",
  "weekly_calendar",
  // F9: la narración de Ritmo bajo demanda. Se cobra por tokens (no tiene
  // tarifa fija en `flat`) porque su costo depende del texto que produce,
  // igual que un turno de chat.
  "ritmo_narration",
  "refund",
  "adjustment",
]);

// Tiers de suscripción (addendum ADR-012, 2026-08-09). La cuota de cada
// tier vive en apps/api/src/credits/rate-card.ts, no en la DB — cambiarla
// no debe requerir migración.
export const planTier = pgEnum("plan_tier", ["creator", "pro", "agencia"]);

// El objetivo activo del creator (el "Modo" de Ritmo). Enum y no `text` como
// `vertical`: aquél es un catálogo que se va a mover y una entrada retirada
// tiene que poder leerse como "no elegida", mientras que estos tres valores
// son la decisión misma y no una taxonomía que crezca.
export const strategyMode = pgEnum("strategy_mode", MODOS_ESTRATEGIA);

// ── Identidad ────────────────────────────────────────────────────────
// Better Auth será dueño de esta tabla en F1 (configurado con ids uuid
// y modelName "users"); F0 la crea compatible para que las FKs de
// dominio existan desde la primera migración.

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Nombre público (modelo-de-datos.md); NULL → la UI cae a name.
  displayName: text("display_name"),
  timezone: text("timezone").notNull().default("America/Mexico_City"),
  // Gate explícito del onboarding (F4): NULL → el guard del cliente
  // redirige a /onboarding. No se infiere de "¿existe brand_voices?" para
  // no dejar al usuario atrapado si abandona a medias.
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  // F5: tier de suscripción, determina la cuota mensual (PLAN_QUOTAS en
  // credits/rate-card.ts). Default al tier más bajo — nunca NULL, para que
  // ensureCurrentCycle siempre pueda resolver una cuota.
  planTier: planTier("plan_tier").notNull().default("creator"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Tablas de Better Auth (sessions/accounts/verifications). Shape según
// better-auth 1.6 con nuestras convenciones (uuid con default de DB,
// timestamptz, snake_case). Sin RLS: las administra Better Auth por su
// propio contrato (modelo-de-datos.md; se evalúa RLS extra en F13).

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_by_user").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_by_user").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verifications_by_identifier").on(t.identifier)],
);

// ── Configuración ────────────────────────────────────────────────────

export const brandVoices = pgTable(
  "brand_voices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    marketCountry: text("market_country").notNull().default("MX"),
    marketRegion: text("market_region"),
    niche: text("niche").array().notNull().default([]),
    // F9: la vertical del catálogo cerrado (packages/shared/verticals.ts), de
    // la que cuelga la caché compartida de tendencias. NULL no es "sin
    // vertical": es "el usuario no la ha corregido", y entonces se deriva de
    // `niche` al leer. Guardarla solo cuando la elige a mano hace que mejorar
    // el diccionario de derivación siga beneficiando a quien nunca la tocó,
    // en vez de dejarlo congelado en la adivinanza del día que se registró.
    //
    // La macro-región NO se guarda: se deriva de `market_region` con una
    // función pura. Un valor derivado guardado al lado de su fuente, sin nada
    // que los sincronice, se vuelve mentira en cuanto alguien edita la fuente.
    vertical: text("vertical"),
    // Lo que el usuario quiere que busquemos, en sus palabras. Opcional: sin
    // esto la búsqueda se arma igual con su nicho, su audiencia y su región.
    // Es texto libre y por eso entra al prompt como DATO delimitado, nunca
    // como instrucción (ver trends/prompt.ts).
    trendPrompt: text("trend_prompt"),
    // Lo que NO quiere ver. Mismo trato de dato que el anterior.
    trendExclude: text("trend_exclude"),
    // Idiomas de las fuentes. El default es español porque el producto es para
    // creators mexicanos; en nichos técnicos casi todo lo que se mueve está en
    // inglés, y sin esta perilla el prompt lo escondía.
    trendLangs: text("trend_langs").array().notNull().default(["es"]),
    // El Modo que el usuario ELIGIÓ. NULL no es "sin modo": es "no lo ha
    // tocado", y entonces se deriva de `extras.goals` al leer — el mismo
    // criterio que `vertical`. Guardarlo solo cuando lo elige a mano hace que
    // mejorar la derivación siga beneficiando a quien nunca lo tocó.
    modo: strategyMode("modo"),
    audience: text("audience"),
    register: voiceRegister("register").notNull().default("neutro_profesional"),
    // Posición fina 0-100 sobre el slider de formalidad (doc §4); `register`
    // es el ancla categórica que el onboarding escribe con un click. Los dos
    // campos viven sincronizados en el mismo objeto — nunca dos sistemas.
    formality: smallint("formality").notNull().default(50),
    allowedExpressions: text("allowed_expressions").array().notNull().default([]),
    bannedExpressions: text("banned_expressions").array().notNull().default([]),
    useAnglicisms: boolean("use_anglicisms").notNull().default(true),
    keyTopics: text("key_topics").array().notNull().default([]),
    preferredCtas: text("preferred_ctas").array().notNull().default([]),
    // Hasta 2 { text, sourceCardId? } (doc §2 Bloque D). sourceCardId queda
    // sin usar hasta que exista Biblioteca; sin migración cuando llegue.
    referenceExamples: jsonb("reference_examples").notNull().default([]),
    extras: jsonb("extras").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Exactamente una voz default por usuario.
    uniqueIndex("brand_voices_one_default_per_user")
      .on(t.userId)
      .where(sql`${t.isDefault}`),
    check("brand_voices_formality_range", sql`${t.formality} BETWEEN 0 AND 100`),
  ],
);

export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon"),
  // NULL → el chat resuelve a la voz default del usuario (COALESCE).
  brandVoiceId: uuid("brand_voice_id").references(() => brandVoices.id, { onDelete: "set null" }),
  position: bigint("position", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Conversación ─────────────────────────────────────────────────────

export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    title: text("title").notNull().default("Nuevo chat"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // F6.5: timestamp nullable, no boolean — mismo patrón que archivedAt y
    // socialConnectIntents.consumedAt. Además de "está fijado" da gratis el
    // orden ENTRE fijados (el último que fijaste, arriba); un boolean
    // necesitaría una columna de posición aparte.
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("chats_recents").on(t.userId, t.lastMessageAt),
    // Archivar significa "sácalo de mi lista de trabajo" y fijar significa
    // "manténlo arriba de mi lista de trabajo": sostener los dos a la vez
    // es una contradicción. ChatRepository.setArchived limpia el pin al
    // archivar; esto lo vuelve un invariante real y no una convención.
    check("chats_not_pinned_and_archived", sql`${t.pinnedAt} IS NULL OR ${t.archivedAt} IS NULL`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // Denormalizado a propósito: RLS sin join.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    // Shape UIMessage del AI SDK, persistido tal cual (append-only).
    parts: jsonb("parts").notNull(),
    channel: channel("channel").notNull().default("web"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_by_chat").on(t.chatId, t.createdAt)],
);

// ── Contenido ────────────────────────────────────────────────────────

export const publicationCards = pgTable(
  "publication_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Nullable a propósito (F6 PR8): borrar un chat NUNCA debe borrar el
    // rastro de una card — una "scheduled" es un compromiso real vivo en
    // postfa.st, una "published" es historial de algo que ya ocurrió; ni
    // siquiera una "draft" vale la pena perder en silencio. Todas
    // sobreviven huérfanas (chatId → null), mismo patrón que
    // assets.chatId. ChatService.deleteChat además rechaza el borrado
    // completo si quedan cards "scheduled" — sobrevivir con chatId null no
    // basta, esas no se pueden cancelar solas.
    chatId: uuid("chat_id").references(() => chats.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    archetype: publicationArchetype("archetype").notNull(),
    network: socialNetwork("network").notNull(),
    status: cardStatus("status").notNull().default("draft"),
    // Validado con cardContentSchema de @presencia/shared.
    content: jsonb("content").notNull(),
    // Parentesco multi-red plano; el estado del grupo se deriva.
    groupId: uuid("group_id"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // F6: a qué cuenta conectada se publica — se fija al programar, nunca
    // antes (una card en draft no tiene destino todavía). "set null" en vez
    // de cascade: desconectar/borrar la cuenta no debe borrar el contenido
    // ya generado, solo dejarlo sin destino (CardsService lo rechaza al
    // reprogramar si la cuenta ya no está).
    socialAccountId: uuid("social_account_id").references(() => socialAccounts.id, {
      onDelete: "set null",
    }),
    providerRef: text("provider_ref"),
    // F7.5: enlace al post ya publicado en la red. Lo llena la
    // reconciliación junto con published_at, y solo si el proveedor lo da:
    // PostFast no lo devuelve nunca, así que ahí se queda null y los botones
    // "Ver en la red" siguen apagados con su tooltip.
    postUrl: text("post_url"),
    // F8.7: id nativo del post en la red (Facebook `<pageId>_<postId>`,
    // LinkedIn `urn:li:share:…`). Lo llena la misma escritura que published_at
    // y es la llave con la que se le piden métricas al proveedor: sin él no
    // hay por quién preguntar. Null legítimo cuando el proveedor no lo da
    // (PostFast no lo incluye en su respuesta de estado).
    platformPostId: text("platform_post_id"),
    errorDetail: jsonb("error_detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cards_calendar").on(t.userId, t.scheduledAt),
    index("cards_by_group").on(t.groupId),
  ],
);

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  chatId: uuid("chat_id").references(() => chats.id, { onDelete: "set null" }),
  cardId: uuid("card_id").references(() => publicationCards.id, { onDelete: "set null" }),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  source: assetSource("source").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Canales y cuentas ────────────────────────────────────────────────

export const channelLinks = pgTable(
  "channel_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: channel("channel").notNull(),
    externalId: text("external_id").notNull(),
    status: channelLinkStatus("status").notNull().default("pending"),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("channel_links_external").on(t.channel, t.externalId)],
);

export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: socialNetwork("network").notNull(),
    providerRef: text("provider_ref").notNull(),
    displayName: text("display_name"),
    status: socialAccountStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // F6: el workspace de PostFast es único y global — providerRef (su
    // socialMediaId) no puede pertenecer a dos usuarios de Presencia a la
    // vez. Es la defensa real contra que dos tenants reclamen la misma
    // cuenta al conectar canales (ADR-009 addendum).
    uniqueIndex("social_accounts_provider_ref").on(t.providerRef),
  ],
);

// F6: snapshot de la conexión de canales (ADR-009 addendum). El workspace de
// PostFast es compartido entre todos los usuarios de Presencia, así que
// "conectar tu red" no puede ser "leer las cuentas del workspace" — se
// resuelve con un diff: se guarda qué refs ya existían antes de mandar al
// usuario a postfa.st, y al volver, las refs NUEVAS son las suyas.
export const socialConnectIntents = pgTable("social_connect_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  knownAccountRefs: jsonb("known_account_refs").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Créditos ─────────────────────────────────────────────────────────

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // + acreditación, − consumo. Nunca 0 (constraint en 0001_rls.sql).
    delta: bigint("delta", { mode: "number" }).notNull(),
    reason: creditReason("reason").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    // F5: qué versión de RATE_CARDS (credits/rate-card.ts) generó este
    // asiento. Cuando se recalibre la tarifa, los asientos viejos siguen
    // cuadrando con la tarifa vigente cuando se registraron (ADR-012).
    rateCardVersion: smallint("rate_card_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_balance").on(t.userId, t.createdAt),
    // Idempotencia: un reintento del mismo efecto (mismo mensaje/card/asset)
    // nunca cobra dos veces. NULL en reference_id (p.ej. monthly_grant) no
    // participa — cada grant mensual sí necesita poder repetirse por diseño.
    uniqueIndex("ledger_dedup")
      .on(t.userId, t.reason, t.referenceType, t.referenceId)
      .where(sql`${t.referenceId} is not null`),
  ],
);

// ── Objetivos de cadencia (F9) ───────────────────────────────────────
// Cuántas publicaciones por semana quiere hacer el usuario en cada red.
//
// La AUSENCIA de fila es un valor: significa "no he puesto la mía, usa la
// sugerida" (META_SEMANAL_SUGERIDA en packages/shared/src/ritmo.ts). Mismo
// criterio que `brand_voices.vertical`: sembrar la sugerencia como dato
// convertiría a cada usuario en alguien que ya eligió, y la UI perdería la
// distinción entre un número que el producto propuso y uno que la persona
// aceptó — que no son la misma promesa.

export const cadenceTargets = pgTable(
  "cadence_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    network: socialNetwork("network").notNull(),
    // Publicaciones por semana. `0` es legítimo: "en esta red no publico",
    // que es distinto de no tener fila.
    target: smallint("target").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("cadence_targets_user_network").on(t.userId, t.network)],
);

// ── Narración de Ritmo (F9) ──────────────────────────────────────────
// El texto que el modelo redacta a partir de los números del motor.
//
// Se guarda, y no se regenera en cada click, por dos motivos que apuntan al
// mismo lugar. El cobro se deduplica por día con el índice `ledger_dedup`, que
// necesita un `reference_id` uuid: sin una fila, no hay a qué apuntar. Y sin
// guardar el texto, el segundo click del día pagaría la llamada al modelo sin
// cobrarla — el usuario no lo nota y el gasto sí.
//
// `generated_at` viaja a la UI junto al texto: la narración es una foto de un
// momento, y si el usuario publica después, lo que dice deja de cuadrar con lo
// que tiene en pantalla. Fechada, es una foto; sin fecha, sería el código
// afirmando algo que ya no es cierto.

export const ritmoNarrations = pgTable(
  "ritmo_narrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Día LOCAL del usuario (`users.timezone`), no UTC: la ventana de cobro
    // tiene que coincidir con el día que la persona está viviendo. Con UTC, a
    // alguien en Mérida el "día" se le cortaría a las 18:00.
    day: date("day").notNull(),
    body: text("body").notNull(),
    // Los números con los que se redactó. No es telemetría: es lo que permite
    // saber, ante un texto que suena raro, si el modelo se lo inventó o si
    // recibió eso.
    payload: jsonb("payload").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Una narración por día. Es la misma llave que deduplica el cobro, y estar
  // en la tabla es lo que hace que dos clicks simultáneos no puedan cobrar
  // dos veces: el segundo choca contra el índice, no contra un `if`.
  (t) => [uniqueIndex("ritmo_narrations_user_day").on(t.userId, t.day)],
);

// ── Tendencias (F9.6) ────────────────────────────────────────────────
// Por usuario y con RLS, después de haber nacido como caché compartida sin
// `user_id` — la única excepción a ADR-003, que con esto deja de existir.
//
// El cambio no fue técnico sino de producto: el cubo `(vertical, país,
// región)` era demasiado grueso. Un creator de "programación, IA y devops"
// caía en "tecnología", que es la industria entera, y recibía tendencias de un
// nicho que no era el suyo. La caché existía para que el gasto creciera con
// los nichos y no con los usuarios; la tarifa real de la búsqueda con
// grounding —capa gratuita mensual y después un costo por consulta chico—
// hizo que esa palanca valiera mucho menos de lo que costaba en calidad.
// Ver ADR-024.

export const userTrends = pgTable(
  "user_trends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    // Cuándo deja de servir. Explícito y no derivado de generated_at + TTL:
    // así una tanda mala se puede invalidar a mano sin tocar código.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // El array de TrendItem (packages/shared/src/trends.ts). Se valida con
    // Zod al leer: es jsonb, así que el motor no lo garantiza.
    items: jsonb("items").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    // Tokens, duración y —esto es lo que decide la factura— cuántas consultas
    // de búsqueda disparó la llamada. El fee del grounding se cobra por
    // consulta, no por request ni por token, y una sola llamada puede lanzar
    // varias: sin este número cualquier proyección de costo es una corazonada.
    usage: jsonb("usage").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Una sola tanda vigente por usuario: el refresco es un upsert. Sin
    // historial a propósito — nadie pidió "las tendencias de la semana pasada"
    // y guardarlas obligaría a decidir cuándo podarlas.
    uniqueIndex("user_trends_user").on(t.userId),
    // El barrido busca a quién le venció la tanda.
    index("user_trends_expires").on(t.expiresAt),
  ],
);

// Las fuentes propias: los medios que el usuario quiere que miremos.
//
// Tabla y no un array en `brand_voices` porque se listan, se agregan y se
// borran de a una, y porque cada una necesita su propia fecha de alta.
export const trendSources = pgTable(
  "trend_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // El HOST, ya normalizado (sin esquema ni `www.`). Es lo que la búsqueda
    // puede acotar con `site:` y lo que el usuario reconoce en la tarjeta;
    // guardar la ruta completa acotaría la búsqueda a una sola página.
    host: text("host").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("trend_sources_user_host").on(t.userId, t.host)],
);

// ── Telemetría de IA ─────────────────────────────────────────────────
// Append-only (F4.5): guarda el usage crudo del proveedor por turno, no una
// unidad derivada — la normalización a créditos es trabajo de F5. RLS +
// REVOKE UPDATE/DELETE viven en la migración custom (mismo patrón que 0001
// para credit_ledger, pero aquí el motor lo garantiza en vez de la
// convención).

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Denormalizado a propósito (patrón de messages): RLS sin join.
    chatId: uuid("chat_id").references(() => chats.id, { onDelete: "cascade" }),
    taskKind: aiTaskKind("task_kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cachedInputTokens: integer("cached_input_tokens"),
    // Llamadas reales al proveedor dentro del turno (tool calls incluidos).
    stepsCount: smallint("steps_count").notNull(),
    durationMs: integer("duration_ms").notNull(),
    // Crudo del proveedor: usage + providerMetadata por step, finishReason.
    // Ver runAgentTurn (chat.service.ts) — nunca se normaliza aquí.
    providerRaw: jsonb("provider_raw").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_by_user").on(t.userId, t.createdAt)],
);

// F8.7: métricas de una publicación, un snapshot por bucket de tiempo.
//
// La llave NO es la card, es `(user_id, network, platform_post_id,
// snapshot_at)`, y cada parte está elegida:
//
//  - `card_id` es NULLABLE. Un post puede existir en la red sin haber nacido
//    en Presencia — es el caso del creator que conecta sus cuentas y trae un
//    historial previo. Atarlo a la card haría imposible guardarlo sin una
//    migración después.
//  - La llave NO incluye `social_account_id` aunque la columna exista, por
//    dos razones. Una es que la columna es NULLABLE (el `SET NULL` de abajo),
//    y un NULL en un índice único no colisiona con nada: el upsert insertaría
//    una fila nueva cada pase. La otra es que la fila no es estable — borrar
//    una cuenta y volver a conectarla crea una FILA NUEVA (reconectar sin
//    borrar sí reutiliza la vieja, ver ChannelsService.claimConnectIntent),
//    y entonces el mismo post del mismo bucket se guardaría dos veces.
//    `(user_id, network, platform_post_id)` identifica la publicación sin
//    depender de por cuál conexión se llegó a ella.
//  - Un snapshot por BUCKET DE TIEMPO, no una fila viva por post. Una sola
//    fila que se sobrescribe pierde la velocidad, que es justo la señal:
//    cuánto creció un post en sus primeras horas distingue el que funcionó
//    del que no, y el total acumulado no.
//
//    El ancho del bucket lo decide la edad del post (`frescura.ts`): 1 h en
//    las primeras 12, 6 h hasta las 48, 1 día hasta los 14, 3 días hasta los
//    30. Así la resolución es fina donde pasa algo y barata donde no, y
//    —clave— la frecuencia de medición no puede divergir de la resolución:
//    medir dos veces dentro del mismo bucket sobrescribe la misma fila en vez
//    de generar un punto, que es exactamente lo que el índice único garantiza.
//
// Las métricas van DOS veces: normalizadas en columnas (lo que comparten
// todas las redes, que es lo que Ritmo va a leer) y crudas en `raw` (lo que
// cada red reporta además). Es el mismo criterio de ai_usage_events: lo
// derivado se puede recalcular, lo crudo no se puede recuperar.
//
// NULL no es 0, y esta distinción es de producto, no de estilo: `reach: 0` es
// "nadie lo vio", `reach: null` es "la red no lo reportó". Confundirlos haría
// que una recomendación de Ritmo promediara ceros inventados.
export const postMetrics = pgTable(
  "post_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SET NULL y no cascade: desconectar una cuenta no borra el historial de
    // lo que se publicó con ella — es justo el historial del que Ritmo
    // aprende.
    socialAccountId: uuid("social_account_id").references(() => socialAccounts.id, {
      onDelete: "set null",
    }),
    // Denormalizada a propósito: sobrevive al SET NULL de arriba (sin esto,
    // desconectar la cuenta dejaría filas sin saber de qué red son) y es
    // parte de la llave, porque un id nativo solo es único dentro de su red.
    network: socialNetwork("network").notNull(),
    platformPostId: text("platform_post_id").notNull(),
    cardId: uuid("card_id").references(() => publicationCards.id, { onDelete: "set null" }),
    // Inicio del bucket al que pertenece esta medición, alineado al reloj UTC
    // (no a la hora de publicación): así dos posts distintos tienen series
    // comparables y dos pases del mismo bucket escriben la misma fila. El
    // ancho lo decide la edad del post, ver frescura.ts.
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
    // Cuándo lo leímos nosotros. No es lo mismo que snapshot_at y no es
    // redundante: dice en qué momento DENTRO del bucket se tomó la medición.
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    // Hora de publicación del post. Copiada acá y no leída por join con la
    // card: las filas sin card (backfill) también la necesitan, y es la
    // materia prima de "mejores horarios" (F9).
    publishedAt: timestamp("published_at", { withTimezone: true }),
    impressions: bigint("impressions", { mode: "number" }),
    reach: bigint("reach", { mode: "number" }),
    likes: bigint("likes", { mode: "number" }),
    comments: bigint("comments", { mode: "number" }),
    shares: bigint("shares", { mode: "number" }),
    // Lo que devolvió el proveedor, sin tocar. Incluye lo que no cabe en las
    // columnas de arriba (retención de video, reacciones por tipo) y también
    // el motivo cuando NO hubo métricas.
    raw: jsonb("raw").notNull(),
    // Qué adapter lo trajo. Los números de dos proveedores no siempre son
    // comparables (Facebook llama "impressions" a cosas distintas según por
    // dónde se pregunte), así que la procedencia es parte del dato.
    provider: text("provider").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // El invariante del DoD: un segundo pase dentro del mismo bucket actualiza
    // la fila, no crea otra.
    uniqueIndex("post_metrics_snapshot").on(t.userId, t.network, t.platformPostId, t.snapshotAt),
    // Para el join de Analíticas (F12) y para saber qué cards ya tienen datos.
    index("post_metrics_by_card").on(t.cardId),
  ],
);
