/**
 * Chats con cada estado del turno guardado (F10.8.2, sembrado en F10.8.3).
 *
 * Existe porque esos estados solo nacen en vivo: detener en el segundo justo,
 * que falle el proveedor, un turno de antes de F10.8.2 que quedó sin
 * respuesta. Storybook los muestra en aislamiento; esto deja probar el flujo
 * real contra la API: recargar, Reintentar y Editar.
 *
 * Solo el último turno de un chat es accionable, así que cada estado
 * accionable va en su propio chat. Todos viven en la carpeta "Estados del
 * turno", que es también la marca de idempotencia: si ya existe, no se siembra
 * de nuevo.
 *
 * `createdAt` va explícito y creciente: en un insert en lote el default
 * `now()` es el mismo para todas las filas, y el orden del chat quedaría al
 * azar.
 */
import { and, eq } from "drizzle-orm";
import type { MessageStatus } from "@presencia/shared";
import type { Tx } from "../src/db/db.service.js";
import { chats, folders, messages } from "../src/db/schema.js";

const CARPETA = "Estados del turno";

type Turno = {
  pedido: string;
  /** Sin respuesta: el mensaje del creator queda solo (huérfano de antes de F10.8.2). */
  respuesta?: { texto: string; status: MessageStatus };
};

const PARCIAL =
  "Las marquesitas son de esas cosas que en Mérida no se discuten: crujientes, con queso de bola y";

const COMPLETA =
  "Va una propuesta para Instagram, pensada para el antojo de la tarde:\n\n" +
  '**Gancho:** "¿Queso de bola solo o con Nutella? En Mérida esto divide familias."\n\n' +
  "1. Abre con un close-up de la marquesita saliendo de la plancha.\n" +
  "2. Pregunta en el texto por su combinación favorita.\n" +
  "3. Cierra con la ubicación y el horario del carrito.";

const CHATS: { titulo: string; turnos: Turno[] }[] = [
  {
    // Turnos viejos en cada estado (sin botones) y, al final, uno completo.
    titulo: "Historial con estados",
    turnos: [
      {
        pedido: "Escríbeme 900 palabras sobre la jarana yucateca. Solo texto.",
        respuesta: { texto: "", status: "stopped" },
      },
      {
        pedido: "Hazme un post para Instagram sobre las marquesitas de Mérida.",
        respuesta: { texto: PARCIAL, status: "stopped" },
      },
      {
        pedido: "Dame 5 ideas de reels para un carrito de marquesitas.",
        respuesta: {
          texto: "Van cinco, pensadas para grabar con el celular:\n\n1. El crujido",
          status: "failed",
        },
      },
      { pedido: "¿Qué es el relleno negro? En dos líneas." },
      {
        pedido: "Ahora sí, hazme el post de marquesitas.",
        respuesta: { texto: COMPLETA, status: "complete" },
      },
    ],
  },
  {
    titulo: "Último turno: detenida antes de empezar",
    turnos: [
      {
        pedido: "Hazme un post para Instagram sobre las marquesitas de Mérida.",
        respuesta: { texto: "", status: "stopped" },
      },
    ],
  },
  {
    titulo: "Último turno: detenida con texto",
    turnos: [
      {
        pedido: "Hazme un post para Instagram sobre las marquesitas de Mérida.",
        respuesta: { texto: PARCIAL, status: "stopped" },
      },
    ],
  },
  {
    titulo: "Último turno: falló",
    turnos: [
      {
        pedido: "Hazme un post para Instagram sobre las marquesitas de Mérida.",
        respuesta: { texto: "", status: "failed" },
      },
    ],
  },
];

/**
 * Siembra la carpeta con sus chats si todavía no existe. Devuelve cuántos
 * chats creó (0 si ya estaba).
 */
export async function seedEstadosDelTurno(tx: Tx, userId: string): Promise<number> {
  const [existente] = await tx
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.userId, userId), eq(folders.name, CARPETA)));
  if (existente) return 0;

  const [carpeta] = await tx
    .insert(folders)
    .values({ userId, name: CARPETA, icon: "🧪" })
    .returning({ id: folders.id });
  if (!carpeta) throw new Error("No se pudo crear la carpeta de estados del turno");

  // Una hora atrás, un minuto por mensaje: el orden queda fijo y el chat no
  // aparece como la conversación más reciente del sidebar.
  let reloj = Date.now() - 60 * 60 * 1000;
  const siguiente = () => new Date((reloj += 60 * 1000));

  for (const { titulo, turnos } of CHATS) {
    const [chat] = await tx
      .insert(chats)
      .values({ userId, title: titulo, folderId: carpeta.id })
      .returning({ id: chats.id });
    if (!chat) throw new Error(`No se pudo crear el chat "${titulo}"`);

    const filas = turnos.flatMap(({ pedido, respuesta }) => [
      {
        chatId: chat.id,
        userId,
        role: "user" as const,
        parts: [{ type: "text", text: pedido }],
        createdAt: siguiente(),
      },
      ...(respuesta
        ? [
            {
              chatId: chat.id,
              userId,
              role: "assistant" as const,
              // Como lo guarda el servidor: una cortada antes de la primera
              // palabra solo trae la marca de paso.
              parts: respuesta.texto
                ? [{ type: "step-start" }, { type: "text", text: respuesta.texto, state: "done" }]
                : [{ type: "step-start" }],
              status: respuesta.status,
              createdAt: siguiente(),
            },
          ]
        : []),
    ]);
    await tx.insert(messages).values(filas);
    await tx
      .update(chats)
      .set({ lastMessageAt: filas.at(-1)!.createdAt })
      .where(eq(chats.id, chat.id));
  }
  return CHATS.length;
}
