import type { TurnNotice } from "../../lib/turn-status.js";

// Datos de ejemplo para las historias del chat (F10.8.3). Construidos contra
// los tipos reales: si cambia un tipo, la historia deja de compilar en vez de
// mostrar un estado que ya no existe.

/** Un estado de turno; por default, el último turno detenido antes de empezar. */
export function notice(over: Partial<TurnNotice> = {}): TurnNotice {
  return { status: "stopped", content: "none", hasReply: false, actionable: true, ...over };
}

export const PEDIDO = "Hazme un post para Instagram sobre las marquesitas de Mérida.";

export const PEDIDO_LARGO =
  "Necesito un carrusel de 5 slides para LinkedIn sobre cómo organizo mi semana de contenido: cuándo grabo, cuándo edito y cuándo publico. Que suene cercano, sin frases de gurú, y que cierre con una pregunta para la audiencia.";

export const RESPUESTA_PARCIAL =
  "Las marquesitas son de esas cosas que en Mérida no se discuten: crujientes, con queso de bola y";

export const RESPUESTA = `Va una propuesta para Instagram, pensada para el antojo de la tarde:

**Gancho:** "¿Queso de bola solo o con Nutella? En Mérida esto divide familias."

1. Abre con un close-up de la marquesita saliendo de la plancha.
2. Pregunta en el texto por su combinación favorita.
3. Cierra con la ubicación y el horario del carrito.

\`\`\`text
#marquesitas #merida #yucatan
\`\`\`

¿Quieres que lo prepare también para TikTok?`;
