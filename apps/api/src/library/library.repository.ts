import { Injectable } from "@nestjs/common";
import { sql, type SQL } from "drizzle-orm";
import type {
  CardStatus,
  LibraryCardStatus,
  LibraryOrigin,
  SocialNetwork,
} from "@presencia/shared";
import type { Tx } from "../db/db.service.js";

// El modelo de lectura de Biblioteca (F12): cada imagen con lo que se sabe de
// ella en otras tablas. No escribe nada; las escrituras siguen en
// AssetsRepository y CardsRepository. Sin filtro por user_id: el RLS de la
// transacción es el filtro (ADR-003), también dentro de los CTE.
//
// Tres cosas que este SQL decide y no son obvias:
//
// - **Dónde se usa una imagen se deriva**, no se guarda: está puesta en una
//   card si su id aparece en `content.assetIds` (los slides de un carrusel se
//   reflejan ahí en cada escritura, ver `withSlides`). `assets.card_id` solo
//   dice dónde nació.
// - **Los recortes no son imágenes de Biblioteca.** Lo que entra a un carrusel
//   con otra proporción es una copia recortada (`metadata.croppedFrom`): es la
//   misma imagen, así que se oculta y su uso cuenta como uso de la original.
// - **Los usos se calculan una vez por consulta**, desarmando `assetIds` de
//   todas las cards del creator, y no con un índice GIN por imagen. Son
//   cientos de filas ya acotadas por RLS; el índice se agrega el día que una
//   cuenta lo necesite (mismo criterio que ADR-022 con las agregaciones).

export interface LibraryFilters {
  q?: string;
  origin?: LibraryOrigin;
  network?: SocialNetwork;
  cardStatus?: LibraryCardStatus;
  state?: "chosen" | "discarded";
  createdFrom?: Date;
}

export interface LibraryCursor {
  /** `created_at::text` tal como lo devolvió Postgres: con sus microsegundos. */
  at: string;
  id: string;
}

interface UsoRow {
  id: string;
  chatId: string | null;
  network: SocialNetwork;
  status: CardStatus;
}

export interface LibraryRow extends Record<string, unknown> {
  id: string;
  source: LibraryOrigin;
  mime_type: string;
  size_bytes: string | number;
  metadata: Record<string, unknown>;
  /**
   * ISO 8601 en UTC, armado en Postgres: en una consulta cruda un
   * `timestamptz` llega como texto en el formato de Postgres, que `new Date`
   * no promete entender.
   */
  created_iso: string;
  /** La misma fecha con sus microsegundos, para el cursor: el ISO se queda en milisegundos. */
  cursor_at: string;
  gen_kind: "generate" | "edit" | null;
  description: string | null;
  prompt: string | null;
  instruction: string | null;
  parent_asset_id: string | null;
  chat_id: string | null;
  chat_title: string | null;
  born_card_id: string | null;
  born_chat_id: string | null;
  born_network: SocialNetwork | null;
  born_status: CardStatus | null;
  usos: UsoRow[];
}

/** El total y, por atajo del bento, cuántas hay y los ids de las primeras. */
export interface LibrarySummaryRow extends Record<string, unknown> {
  total: number;
  generated_this_week: number;
  generated_this_week_ids: string[];
  ready_to_publish: number;
  ready_to_publish_ids: string[];
  uploaded: number;
  uploaded_ids: string[];
  published: number;
  published_ids: string[];
}

/** Los filtros de cada atajo del bento: los mismos que manda la web al tocarlo. */
export function shortcutFilters(now: Date, weekDays: number) {
  return {
    generatedThisWeek: {
      origin: "generated",
      createdFrom: new Date(now.getTime() - weekDays * 86_400_000),
    },
    readyToPublish: { state: "chosen", cardStatus: "draft" },
    uploaded: { origin: "uploaded" },
    published: { state: "chosen", cardStatus: "published" },
  } satisfies Record<string, LibraryFilters>;
}

/**
 * Un texto a uuid, o null si no lo es. Los ids que viven en jsonb no tienen
 * tipo: uno mal escrito tiraría la consulta entera con un cast directo, y el
 * CASE garantiza que el cast solo corre sobre lo que ya pasó la forma.
 * Comparar uuid contra uuid (y no `id::text`) deja usar la llave primaria.
 */
const uuidOrNull = (text: SQL) => sql`case
  when ${text} ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then (${text})::uuid
end`;

const LIB = sql`
  with usos as (
    select coalesce(${uuidOrNull(sql`k.metadata ->> 'croppedFrom'`)}, k.id) as root_id,
           c.id as card_id, c.chat_id, c.network, c.status
    from publication_cards c
    -- Solo si es una lista: un assetIds en null o escalar (una fila vieja, un
    -- contenido editado a mano) haría fallar jsonb_array_elements_text, y con
    -- él toda la Biblioteca de esa cuenta.
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(c.content -> 'assetIds') = 'array'
           then c.content -> 'assetIds' else '[]'::jsonb end
    ) as u(asset_id)
    join assets k on k.id = ${uuidOrNull(sql`u.asset_id`)}
    -- "canceled" no lo escribe nadie hoy (cancelar regresa a borrador), pero
    -- si llega, una card cancelada no es un lugar donde la imagen esté puesta.
    where c.status <> 'canceled'
  ),
  usos_por_raiz as (
    select root_id,
           jsonb_agg(distinct jsonb_build_object(
             'id', card_id, 'chatId', chat_id, 'network', network, 'status', status
           )) as usos
    from usos
    group by root_id
  ),
  lib as (
    select a.id, a.source, a.mime_type, a.size_bytes, a.metadata, a.created_at,
           to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_iso,
           a.created_at::text as cursor_at,
           g.kind as gen_kind, g.description, g.prompt, g.instruction, g.parent_asset_id,
           ch.id as chat_id, ch.title as chat_title,
           oc.id as born_card_id, oc.chat_id as born_chat_id,
           oc.network as born_network, oc.status as born_status,
           coalesce(up.usos, '[]'::jsonb) as usos
    from assets a
    left join lateral (
      select g.kind, g.description, g.prompt, g.instruction, g.parent_asset_id
      from image_generations g
      where g.asset_id = a.id
      order by g.created_at desc
      limit 1
    ) g on true
    left join chats ch on ch.id = a.chat_id
    left join publication_cards oc on oc.id = a.card_id
    left join usos_por_raiz up on up.root_id = a.id
    where a.metadata ->> 'croppedFrom' is null
  )`;

// Dónde busca el buscador: lo que pidió al generar, la instrucción de una
// edición, el texto alternativo, el nombre del archivo y el título del chat.
// De una generación sin `description` (anterior a F12) se usa el prompt
// completo; de una edición nunca, porque su prompt es plantilla nuestra.
const HAYSTACK = sql`f_unaccent(lower(
  coalesce(description, case when gen_kind = 'edit' then '' else prompt end, '') || ' ' ||
  coalesce(instruction, '') || ' ' ||
  coalesce(metadata ->> 'alt', '') || ' ' ||
  coalesce(metadata ->> 'originalName', '') || ' ' ||
  coalesce(chat_title, '')
))`;

const SIN_USOS = sql`usos = '[]'::jsonb`;

/** `%` y `_` son comodines de LIKE: escritos por el creator, son letras. */
function likeLiteral(word: string): string {
  return word.replace(/[\\%_]/g, "\\$&");
}

/**
 * Qué estados reales cuentan para cada opción del filtro. Una publicación que
 * falló regresó a manos del creator y se edita como un borrador: su imagen
 * está "en un borrador", no en un estado que el filtro no ofrece.
 */
const STATUSES_OF: Record<LibraryCardStatus, CardStatus[]> = {
  draft: ["draft", "failed"],
  scheduled: ["scheduled"],
  published: ["published"],
};

/**
 * "Está en una card de esta red y en este estado". Los dos filtros se evalúan
 * sobre la MISMA card: por separado, una imagen puesta en un borrador de
 * Instagram y en una publicada de LinkedIn pasaba "Instagram + Publicado".
 * Si no se usa en ningún lado, cuenta la card donde nació.
 */
function cardCondition(network?: SocialNetwork, cardStatus?: LibraryCardStatus): SQL | null {
  if (!network && !cardStatus) return null;
  const statuses: (CardStatus | null)[] = cardStatus ? STATUSES_OF[cardStatus] : [null];
  const alternatives = statuses.map((status) => {
    const wanted = sql`jsonb_strip_nulls(jsonb_build_object(
      'network', ${network ?? null}::text, 'status', ${status}::text
    ))`;
    const born = [
      ...(network ? [sql`born_network::text = ${network}`] : []),
      ...(status ? [sql`born_status::text = ${status}`] : []),
    ];
    return sql`(
      usos @> jsonb_build_array(${wanted})
      or (${SIN_USOS} and ${sql.join(born, sql` and `)})
    )`;
  });
  return sql`(${sql.join(alternatives, sql` or `)})`;
}

function conditions(filters: LibraryFilters): SQL[] {
  const out: SQL[] = [];
  if (filters.origin) out.push(sql`source::text = ${filters.origin}`);
  const enCard = cardCondition(filters.network, filters.cardStatus);
  if (enCard) out.push(enCard);
  if (filters.state === "chosen") out.push(sql`usos <> '[]'::jsonb`);
  if (filters.state === "discarded") out.push(sql`(${SIN_USOS} and born_card_id is not null)`);
  if (filters.createdFrom) {
    out.push(sql`created_at >= ${filters.createdFrom.toISOString()}::timestamptz`);
  }
  // Todas las palabras, en cualquier orden, como parte de una palabra: el
  // buscador filtra mientras se escribe, y "caf" tiene que encontrar "café".
  // Por eso no es el FTS de ADR-017, que solo empata palabras completas.
  for (const word of (filters.q ?? "").split(/\s+/).filter(Boolean)) {
    out.push(sql`${HAYSTACK} like '%' || f_unaccent(lower(${likeLiteral(word)})) || '%'`);
  }
  return out;
}

function where(parts: SQL[]): SQL {
  return parts.length === 0 ? sql`true` : sql.join(parts, sql` and `);
}

@Injectable()
export class LibraryRepository {
  /** Una página, de lo más nuevo a lo más viejo. Pide `limit` y devuelve hasta `limit`. */
  async page(
    tx: Tx,
    filters: LibraryFilters,
    cursor: LibraryCursor | null,
    limit: number,
  ): Promise<LibraryRow[]> {
    const parts = conditions(filters);
    if (cursor) {
      parts.push(sql`(created_at, id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`);
    }
    const result = await tx.execute<LibraryRow>(sql`
      ${LIB}
      select * from lib
      where ${where(parts)}
      order by created_at desc, id desc
      limit ${limit}`);
    return result.rows;
  }

  /** Una imagen por id, o `undefined` si no existe, no es suya o es un recorte. */
  async findOne(tx: Tx, id: string): Promise<LibraryRow | undefined> {
    const result = await tx.execute<LibraryRow>(sql`
      ${LIB}
      select * from lib where id = ${id}::uuid`);
    return result.rows[0];
  }

  /**
   * El bento en una sola pasada sobre `lib`: el total y, por atajo, cuántas
   * hay y los ids de las `thumbs` más nuevas. Una consulta y no una por atajo:
   * cada una recalcularía los usos de todas las cards.
   */
  async summary(
    tx: Tx,
    shortcuts: ReturnType<typeof shortcutFilters>,
    thumbs: number,
  ): Promise<LibrarySummaryRow> {
    const only = (filters: LibraryFilters) => {
      const cond = where(conditions(filters));
      return {
        count: sql`(count(*) filter (where ${cond}))::int`,
        // jsonb y no uuid[]: llega ya como arreglo de JS, sin depender de qué
        // parsers de arreglos tenga registrados el driver.
        ids: sql`coalesce(to_jsonb(
          (array_agg(id order by created_at desc, id desc) filter (where ${cond}))[1:${thumbs}]
        ), '[]'::jsonb)`,
      };
    };
    const week = only(shortcuts.generatedThisWeek);
    const ready = only(shortcuts.readyToPublish);
    const uploaded = only(shortcuts.uploaded);
    const published = only(shortcuts.published);
    const result = await tx.execute<LibrarySummaryRow>(sql`
      ${LIB}
      select count(*)::int as total,
             ${week.count} as generated_this_week, ${week.ids} as generated_this_week_ids,
             ${ready.count} as ready_to_publish, ${ready.ids} as ready_to_publish_ids,
             ${uploaded.count} as uploaded, ${uploaded.ids} as uploaded_ids,
             ${published.count} as published, ${published.ids} as published_ids
      from lib`);
    const row = result.rows[0];
    if (!row) throw new Error("El resumen de Biblioteca no devolvió fila");
    return row;
  }
}
