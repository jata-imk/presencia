import { z } from "zod";

// Contratos núcleo de publication_cards (docs/reference/modelo-de-datos.md).
// El backend valida el JSONB `content` con el schema del arquetipo; el
// frontend renderiza la card según el mismo contrato (ADR-005).

export const publicationArchetypeSchema = z.enum(["visual_first", "video_script", "text_first"]);
export type PublicationArchetype = z.infer<typeof publicationArchetypeSchema>;

export const cardStatusSchema = z.enum(["draft", "scheduled", "published", "canceled", "failed"]);
export type CardStatus = z.infer<typeof cardStatusSchema>;

// Fuente única del mapeo red↔arquetipo (antes triplicado: enum completo,
// 3 enums restringidos por tool y el pgEnum de la DB). El `satisfies`
// obliga a cubrir los 3 arquetipos si se agrega uno nuevo.
export const NETWORKS_BY_ARCHETYPE = {
  visual_first: ["instagram", "facebook"],
  video_script: ["tiktok", "youtube"],
  text_first: ["linkedin", "threads", "x"],
} as const satisfies Record<PublicationArchetype, readonly string[]>;

const ALL_NETWORKS = [
  ...NETWORKS_BY_ARCHETYPE.visual_first,
  ...NETWORKS_BY_ARCHETYPE.video_script,
  ...NETWORKS_BY_ARCHETYPE.text_first,
] as const;

export const socialNetworkSchema = z.enum(ALL_NETWORKS);
export type SocialNetwork = z.infer<typeof socialNetworkSchema>;

// Contenido por arquetipo. Versión mínima de F0; los campos finos se
// afinan en F3 cuando las tools de crear borrador cobran vida.

export const visualFirstContentSchema = z.object({
  archetype: z.literal("visual_first"),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  imagePrompt: z.string().optional(),
  assetIds: z.array(z.uuid()).default([]),
});

export const videoScriptContentSchema = z.object({
  archetype: z.literal("video_script"),
  hook: z.string(),
  script: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  recordingNotes: z.string().optional(),
  // Faltaba (code review 2026-08-20): assertHasMedia (cards.service.ts)
  // exige `"assetIds" in content` para tiktok/youtube igual que para
  // instagram — sin este campo la propiedad nunca existe en video_script,
  // así que el check siempre falla por ausencia en vez de por lista vacía.
  // Mismo resultado hoy (bloqueado, F10/F11 sin construir), pero
  // estructuralmente honesto y a prueba de que F10/F11 agregue el upload
  // de video sin que alguien tenga que acordarse de este campo.
  assetIds: z.array(z.uuid()).default([]),
});

export const textFirstContentSchema = z.object({
  archetype: z.literal("text_first"),
  body: z.string(),
  hashtags: z.array(z.string()).default([]),
  assetIds: z.array(z.uuid()).default([]),
});

export const cardContentSchema = z.discriminatedUnion("archetype", [
  visualFirstContentSchema,
  videoScriptContentSchema,
  textFirstContentSchema,
]);
export type CardContent = z.infer<typeof cardContentSchema>;

const visualFirstToolInputSchema = visualFirstContentSchema
  .omit({ archetype: true, assetIds: true })
  .extend({ network: z.enum(NETWORKS_BY_ARCHETYPE.visual_first) });
type VisualFirstToolInput = z.infer<typeof visualFirstToolInputSchema>;

const videoScriptToolInputSchema = videoScriptContentSchema
  .omit({ archetype: true, assetIds: true })
  .extend({ network: z.enum(NETWORKS_BY_ARCHETYPE.video_script) });
type VideoScriptToolInput = z.infer<typeof videoScriptToolInputSchema>;

const textFirstToolInputSchema = textFirstContentSchema
  .omit({ archetype: true, assetIds: true })
  .extend({ network: z.enum(NETWORKS_BY_ARCHETYPE.text_first) });
type TextFirstToolInput = z.infer<typeof textFirstToolInputSchema>;

export interface CardArchetypeToolDefinition<
  TInput extends { network: SocialNetwork } = { network: SocialNetwork },
  TName extends string = string,
> {
  archetype: PublicationArchetype;
  toolName: TName;
  description: string;
  networks: readonly SocialNetwork[];
  inputSchema: z.ZodType<TInput>;
  buildContent: (input: TInput) => CardContent;
}

// Construye la definición con TInput inferido del schema/builder de cada
// entrada (full type-safety al declarar cada fila), luego la erasiona al
// shape base para que el array sea heterogéneo — cada arquetipo tiene su
// propio input, pero todas comparten `network`, que es lo único que el
// consumidor genérico (la factory de tools) necesita leer directamente.
// TName se preserva literal (no se erasiona) para que CardArchetypeToolName
// abajo se derive del array en vez de duplicarse a mano en cada consumidor.
function defineCardArchetypeTool<TInput extends { network: SocialNetwork }, TName extends string>(
  def: CardArchetypeToolDefinition<TInput, TName>,
): CardArchetypeToolDefinition<{ network: SocialNetwork }, TName> {
  return def as unknown as CardArchetypeToolDefinition<{ network: SocialNetwork }, TName>;
}

// Fuente única de las 3 tools de crear borrador (ADR-005). NO usamos
// cardContentSchema (discriminatedUnion) como inputSchema de tool: medido
// contra Gemini 3.5 Flash, Claude Haiku 4.5 y DeepSeek V4 Flash con keys
// reales, los 3 proveedores generan tool calls con input inválido en la
// mayoría de los intentos (docs/reference/suite-cultural/2026-07-22-reporte.md).
// En vez de una tool con schema aplanado + reconciliación posterior, 3 tools
// separadas — una por arquetipo — reusando el schema de contenido tal cual.
// El modelo no llena un objeto con reglas condicionales: elige cuál tool
// llamar, y esa elección es la inferencia del arquetipo.
//
// Tanto el backend (apps/api/src/cards/publication-card.tools.ts) como la
// suite cultural (apps/api/scripts/cultural-suite/run.ts) iteran este array
// para construir sus tools — nombre, descripción y schema viven en un solo
// lugar, nunca duplicados a mano.
export const CARD_ARCHETYPE_TOOLS = [
  defineCardArchetypeTool<VisualFirstToolInput, "crear_borrador_visual">({
    archetype: "visual_first",
    toolName: "crear_borrador_visual",
    description:
      "Crea un borrador de publicación visual (imagen o carrusel) para " +
      "Instagram o Facebook. Úsala solo cuando el usuario pida explícitamente " +
      "un post listo para esas redes — no para lluvia de ideas.",
    networks: NETWORKS_BY_ARCHETYPE.visual_first,
    inputSchema: visualFirstToolInputSchema,
    buildContent: (input) =>
      visualFirstContentSchema.parse({ ...input, archetype: "visual_first", assetIds: [] }),
  }),
  defineCardArchetypeTool<VideoScriptToolInput, "crear_borrador_video">({
    archetype: "video_script",
    toolName: "crear_borrador_video",
    description:
      "Crea un borrador de guion de video para TikTok o YouTube. Úsala " +
      "solo cuando el usuario pida explícitamente un guion listo para esas " +
      "redes — no para lluvia de ideas.",
    networks: NETWORKS_BY_ARCHETYPE.video_script,
    inputSchema: videoScriptToolInputSchema,
    buildContent: (input) =>
      videoScriptContentSchema.parse({ ...input, archetype: "video_script", assetIds: [] }),
  }),
  defineCardArchetypeTool<TextFirstToolInput, "crear_borrador_texto">({
    archetype: "text_first",
    toolName: "crear_borrador_texto",
    description:
      "Crea un borrador de publicación de texto para LinkedIn, Threads o X. " +
      "Úsala solo cuando el usuario pida explícitamente un post listo para " +
      "esas redes — no para lluvia de ideas.",
    networks: NETWORKS_BY_ARCHETYPE.text_first,
    inputSchema: textFirstToolInputSchema,
    buildContent: (input) =>
      textFirstContentSchema.parse({ ...input, archetype: "text_first", assetIds: [] }),
  }),
] as const;

// Nombres de tool derivados del array — fuente única para tipar el lado
// frontend (apps/web/src/lib/chat-types.ts) sin duplicarlos a mano.
export type CardArchetypeToolName = (typeof CARD_ARCHETYPE_TOOLS)[number]["toolName"];

// Output de las 3 tools (F3 PR3): el content completo viaja en el output de
// la tool call, no solo {cardId, network, status} — ya se persiste gratis
// dentro de messages.parts, así que el frontend lo pinta directo desde el
// tool part sin round-trip/endpoint nuevo.
export interface CardToolOutput {
  cardId: string;
  network: SocialNetwork;
  status: CardStatus;
  content: CardContent;
}

// F6: ciclo de vida de la card (ADR-009 addendum) — programar, reprogramar,
// cancelar. El DTO de card persistida (outbound, nunca se parsea desde el
// cliente) vive como interfaz simple, mismo criterio que QuotaStatusDto en
// credits.ts; los bodies que SÍ llegan del cliente son los únicos con
// z.object.

export interface PublicationCardDto {
  id: string;
  /** null si el chat que la originó se eliminó (F6 PR8) — la card sobrevive huérfana. */
  chatId: string | null;
  archetype: PublicationArchetype;
  network: SocialNetwork;
  status: CardStatus;
  content: CardContent;
  /**
   * Parentesco por turno de generación — todas las cards creadas en el
   * mismo turno de chat comparten un groupId (asignado en
   * publication-card.tools.ts), nunca al seleccionar cards después: es
   * "propiedad emergente", no tabla propia (docs/reference/modelo-de-datos.md
   * §grupo). El frontend lo usa para ofrecer "programar juntas" con el
   * toggle de horario compartido (ScheduleDrawer, modo batch).
   * Null en cards huérfanas o de un solo turno sin hermanas.
   * Dos cards del MISMO groupId apuntando a la MISMA red son válidas para
   * el schema (scheduleGroupBodySchema está keyed por cardId, no por red)
   * pero hoy se ven indistinguibles en el drawer batch — sin concepto de
   * "versiones" todavía, limitación conocida, no resuelta.
   */
  groupId: string | null;
  /** ISO 8601 UTC, o null si nunca se programó. */
  scheduledAt: string | null;
  publishedAt: string | null;
  socialAccountId: string | null;
  /** Mensaje en español, listo para mostrar, cuando status es "failed". Null si no hay. */
  errorMessage: string | null;
}

export const cardIdParamSchema = z.object({ id: z.uuid() });

export const scheduleCardBodySchema = z.object({
  socialAccountId: z.uuid(),
  scheduledAt: z.iso.datetime({ offset: true }),
});
export type ScheduleCardBody = z.infer<typeof scheduleCardBodySchema>;

// Toggle "mismo horario para todas / personalizar por red" del drawer
// (presencia-chat.md): cada item o trae fecha/hora + cuenta (se programa) o
// se marca keepDraft (se deja como estaba, sin tocarla). Un grupo puede
// programar unas redes y dejar otras en borrador en la misma llamada —
// variante "d3b" del drawer diseñado en Claude Design.
const scheduleGroupItemSchema = z.union([
  z.object({
    cardId: z.uuid(),
    socialAccountId: z.uuid(),
    scheduledAt: z.iso.datetime({ offset: true }),
    keepDraft: z.literal(false).optional(),
  }),
  z.object({ cardId: z.uuid(), keepDraft: z.literal(true) }),
]);
export const scheduleGroupBodySchema = z.object({
  items: z.array(scheduleGroupItemSchema).min(1),
});
export type ScheduleGroupBody = z.infer<typeof scheduleGroupBodySchema>;

export const conflictsQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
});
export type ConflictsQuery = z.infer<typeof conflictsQuerySchema>;

// F7 (Calendario): listado por rango. `conflictsQuerySchema` de arriba no
// sirve para esto y no se toca — su endpoint devuelve SOLO `scheduled` y lo
// consume el ScheduleDrawer para pintar sus markers. El Calendario necesita
// todos los estados y filtros; son dos preguntas distintas a la misma tabla.
//
// Los filtros de lista llegan por query string, donde `?status=draft` y
// `?status=draft&status=scheduled` son el mismo parámetro con cardinalidad
// distinta: Express entrega string en el primer caso y string[] en el
// segundo. El preprocess normaliza ambos (y la forma separada por comas,
// que es la que arma el frontend) a array antes de validar.
const queryList = <T extends z.ZodType>(item: T) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    const raw = Array.isArray(value) ? value : [value];
    // Si llega algo que no es string (un objeto por `?status[a]=b`), se
    // devuelve tal cual para que el array de abajo lo rechace con un 400. Un
    // filtro mal formado que se ignora en silencio es peor que uno que falla:
    // el usuario vería una lista que cree filtrada y no lo está.
    if (!raw.every((entry) => typeof entry === "string")) return value;
    return raw
      .flatMap((entry) => entry.split(","))
      .map((part) => part.trim())
      .filter(Boolean);
  }, z.array(item).min(1).optional());

/**
 * Techo del rango pedible de una sola vez. La vista más ancha es la grilla
 * del mes (6 semanas = 42 días) y el frontend prefetchea el mes contiguo, así
 * que ~100 días cubre todo con aire. Existe para que un `from` de 1970 no se
 * traduzca en un scan de la tabla entera.
 */
export const MAX_CALENDAR_RANGE_DAYS = 100;

export const listCardsQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    status: queryList(cardStatusSchema),
    network: queryList(socialNetworkSchema),
    /**
     * Carpeta del chat que originó la card. Las cards huérfanas (`chatId:
     * null`, el chat se eliminó) nunca matchean un filtro de carpeta: ya no
     * hay de dónde derivarla.
     */
    folderId: z.uuid().optional(),
  })
  .refine(({ from, to }) => new Date(to) > new Date(from), {
    message: "El rango de fechas está invertido.",
  })
  .refine(
    ({ from, to }) =>
      new Date(to).getTime() - new Date(from).getTime() <=
      MAX_CALENDAR_RANGE_DAYS * 24 * 60 * 60 * 1000,
    { message: "El rango de fechas es demasiado amplio." },
  );
export type ListCardsQuery = z.infer<typeof listCardsQuerySchema>;

// Resultado por card de un schedule-group: cada red del grupo actúa
// independiente (una puede programarse y otra fallar sin abortar el resto,
// mismo criterio que el modo "personalizar por red, mixto" del drawer).
export interface ScheduleGroupResultItem {
  cardId: string;
  ok: boolean;
  card: PublicationCardDto | null;
  /** Mensaje en español, listo para mostrar, cuando ok es false. */
  error: string | null;
}

// F4.5 (dieta de contexto, chat.service.ts): resumen compacto de una card ya
// creada, para el historial que viaja al MODELO en turnos siguientes — la UI
// sigue leyendo el `content` completo del tool output (ver arriba), esto
// nunca se persiste ni se manda al navegador.
export function summarizeCardContent(content: CardContent): string {
  // Corta en el límite de palabra más cercano, no a la mitad (ej. "cuidarlo"
  // → "c"). Si no hay espacio razonable antes de `max` (texto sin espacios,
  // o el primer espacio cae muy temprano), cae al corte duro — mejor perder
  // el límite de palabra que devolver un resumen ridículamente corto.
  //
  // Se cuenta por code point ([...text]), no por índice UTF-16 (text.slice):
  // las captions reales usan emojis (🐱💛 al final de frase es el patrón más
  // común) y slice() por índice puede partir un par subrogado a la mitad,
  // dejando un carácter suelto que se corrompe al codificar a UTF-8.
  const truncate = (text: string, max = 80) => {
    const codePoints = [...text];
    if (codePoints.length <= max) return text;
    const slice = codePoints.slice(0, max);
    const lastSpace = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
    const cut = lastSpace >= max * 0.5 ? slice.slice(0, lastSpace) : slice;
    return `${cut.join("").trimEnd()}…`;
  };
  switch (content.archetype) {
    case "visual_first":
      return `post visual — ${truncate(content.caption)}`;
    case "video_script":
      return `guion de video — ${truncate(content.hook)}`;
    case "text_first":
      return `post de texto — ${truncate(content.body)}`;
  }
}
