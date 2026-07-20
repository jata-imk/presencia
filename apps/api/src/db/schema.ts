import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

export const creditReason = pgEnum("credit_reason", [
  "monthly_grant",
  "cycle_expiration",
  "chat_message",
  "idea_generation",
  "multi_adapt",
  "image_generation",
  "weekly_calendar",
  "refund",
  "adjustment",
]);

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
    audience: text("audience"),
    register: voiceRegister("register").notNull().default("neutro_profesional"),
    allowedExpressions: text("allowed_expressions").array().notNull().default([]),
    bannedExpressions: text("banned_expressions").array().notNull().default([]),
    useAnglicisms: boolean("use_anglicisms").notNull().default(true),
    keyTopics: text("key_topics").array().notNull().default([]),
    preferredCtas: text("preferred_ctas").array().notNull().default([]),
    extras: jsonb("extras").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Exactamente una voz default por usuario.
    uniqueIndex("brand_voices_one_default_per_user")
      .on(t.userId)
      .where(sql`${t.isDefault}`),
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
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chats_recents").on(t.userId, t.lastMessageAt)],
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
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
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
    providerRef: text("provider_ref"),
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

export const socialAccounts = pgTable("social_accounts", {
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_balance").on(t.userId, t.createdAt)],
);
