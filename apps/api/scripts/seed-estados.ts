/**
 * Chats con cada estado del turno guardado (F10.8.2, sembrado en F10.8.3).
 *
 * Existe porque esos estados solo nacen en vivo: detener en el segundo justo,
 * que falle el proveedor, un turno de antes de F10.8.2 que quedó sin
 * respuesta. Storybook los muestra en aislamiento; esto deja probar el flujo
 * real contra la API: recargar, Reintentar y Editar. Las variantes con cards
 * (una respuesta cortada que alcanzó a crear borradores) viven en Storybook:
 * aquí pedirían filas de cards de verdad.
 *
 * Solo el último turno de un chat es accionable, así que cada estado
 * accionable va en su propio chat, todos en la carpeta "Estados del turno".
 *
 * Se RECREA en cada corrida: Reintentar o Editar gastan el estado (el turno
 * pasa a completo), y volver a sembrar lo repone sin `--reset`, que borraría
 * toda la data de dev. Se borra con cuidado: solo chats con esos títulos que
 * estén en la carpeta o sueltos (si alguien borró la carpeta, sus chats
 * quedaron sin carpeta y no deben duplicarse), nunca uno homónimo que el
 * creator movió a otra carpeta; y de sus cards, solo los borradores.
 *
 * `createdAt` va explícito y creciente: en un insert en lote el default
 * `now()` es el mismo para todas las filas, y el orden del chat quedaría al
 * azar.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { MessageStatus } from "@presencia/shared";
import type { Tx } from "../src/db/db.service.js";
import { chats, folders, messages, publicationCards } from "../src/db/schema.js";

const FOLDER = "Estados del turno";

type Turn = {
  prompt: string;
  /** Sin respuesta: el mensaje del creator queda solo (huérfano de antes de F10.8.2). */
  reply?: {
    text: string;
    status: MessageStatus;
    /**
     * Las dos formas en que el servidor guarda un corte vacío: `[]` si se
     * cortó antes de llamar al modelo, `[step-start]` si ya había empezado.
     */
    bare?: boolean;
  };
};

const PARTIAL =
  "Las marquesitas son de esas cosas que en Mérida no se discuten: crujientes, con queso de bola y";

const COMPLETE =
  "Va una propuesta para Instagram, pensada para el antojo de la tarde:\n\n" +
  '**Gancho:** "¿Queso de bola solo o con Nutella? En Mérida esto divide familias."\n\n' +
  "1. Abre con un close-up de la marquesita saliendo de la plancha.\n" +
  "2. Pregunta en el texto por su combinación favorita.\n" +
  "3. Cierra con la ubicación y el horario del carrito.";

const PROMPT = "Hazme un post para Instagram sobre las marquesitas de Mérida.";
const REELS_PARTIAL = "Van cinco, pensadas para grabar con el celular:\n\n1. El crujido";

const SEEDED_CHATS: { title: string; turns: Turn[] }[] = [
  {
    // Turnos viejos en cada estado (sin botones) y, al final, uno completo.
    title: "Historial con estados",
    turns: [
      {
        prompt: "Escríbeme 900 palabras sobre la jarana yucateca. Solo texto.",
        reply: { text: "", status: "stopped", bare: true },
      },
      { prompt: PROMPT, reply: { text: PARTIAL, status: "stopped" } },
      {
        prompt: "Dame 5 ideas de reels para un carrito de marquesitas.",
        reply: { text: REELS_PARTIAL, status: "failed" },
      },
      { prompt: "¿Qué es el relleno negro? En dos líneas." },
      {
        prompt: "Ahora sí, hazme el post de marquesitas.",
        reply: { text: COMPLETE, status: "complete" },
      },
    ],
  },
  {
    title: "Último turno: detenida antes de empezar",
    turns: [{ prompt: PROMPT, reply: { text: "", status: "stopped" } }],
  },
  {
    title: "Último turno: detenida con texto",
    turns: [{ prompt: PROMPT, reply: { text: PARTIAL, status: "stopped" } }],
  },
  {
    title: "Último turno: falló",
    turns: [{ prompt: PROMPT, reply: { text: "", status: "failed" } }],
  },
  {
    title: "Último turno: falló con texto",
    turns: [{ prompt: PROMPT, reply: { text: PARTIAL, status: "failed" } }],
  },
  {
    // Un turno que nunca tuvo respuesta guardada (cayó con el servidor, o se
    // cortó antes de llegar): la web lo trata como fallido y accionable.
    title: "Último turno: sin respuesta",
    turns: [{ prompt: PROMPT }],
  },
];

/** Borra lo sembrado antes y lo vuelve a crear. Devuelve cuántos chats creó. */
export async function seedTurnStates(tx: Tx, userId: string): Promise<number> {
  const titles = SEEDED_CHATS.map((c) => c.title);
  const oldFolders = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.userId, userId), eq(folders.name, FOLDER)));
  const oldFolderIds = oldFolders.map((f) => f.id);
  const previous = await tx
    .select({ id: chats.id })
    .from(chats)
    .where(
      and(
        eq(chats.userId, userId),
        inArray(chats.title, titles),
        oldFolderIds.length > 0
          ? or(isNull(chats.folderId), inArray(chats.folderId, oldFolderIds))
          : isNull(chats.folderId),
      ),
    );
  if (previous.length > 0) {
    const ids = previous.map((c) => c.id);
    // Los borradores que crearon los reintentos: sin esto quedarían sueltos
    // (el FK de chat_id es SET NULL). Una card programada o publicada desde
    // estos chats se queda, ya sin chat: es trabajo real del creator.
    await tx
      .delete(publicationCards)
      .where(and(inArray(publicationCards.chatId, ids), eq(publicationCards.status, "draft")));
    await tx.delete(chats).where(inArray(chats.id, ids));
  }
  if (oldFolderIds.length > 0) await tx.delete(folders).where(inArray(folders.id, oldFolderIds));

  const [folder] = await tx
    .insert(folders)
    .values({ userId, name: FOLDER, icon: "🧪" })
    .returning({ id: folders.id });
  if (!folder) throw new Error("No se pudo crear la carpeta de estados del turno");

  // Una semana atrás, un minuto por mensaje: el orden de cada chat queda fijo
  // y la carpeta no se adelanta a los chats de ejemplo en el sidebar.
  let clock = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const next = () => new Date((clock += 60 * 1000));

  for (const { title, turns } of SEEDED_CHATS) {
    const rows = turns.flatMap(({ prompt, reply }) => [
      { role: "user" as const, parts: [{ type: "text", text: prompt }], createdAt: next() },
      ...(reply
        ? [
            {
              role: "assistant" as const,
              parts: reply.text
                ? [{ type: "step-start" }, { type: "text", text: reply.text, state: "done" }]
                : reply.bare
                  ? []
                  : [{ type: "step-start" }],
              status: reply.status,
              createdAt: next(),
            },
          ]
        : []),
    ]);
    const [chat] = await tx
      .insert(chats)
      .values({
        userId,
        title,
        folderId: folder.id,
        lastMessageAt: rows[rows.length - 1]?.createdAt ?? null,
      })
      .returning({ id: chats.id });
    if (!chat) throw new Error(`No se pudo crear el chat "${title}"`);
    await tx.insert(messages).values(rows.map((row) => ({ ...row, chatId: chat.id, userId })));
  }
  return SEEDED_CHATS.length;
}
