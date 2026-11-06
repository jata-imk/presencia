// Los casos de Telegram (F11 PR8, ADR-030): el mismo modelo con el apéndice
// del canal (`channelInstruction`, system-prompt.ts) que corre en producción
// cuando el mensaje llega por el bot. Miden lo que el apéndice pide: respuestas
// cortas para el cel, sin tablas anchas ni encabezados, sin mencionar botones
// de la web, entender una nota de voz transcrita (muletillas, nombres mal
// oídos) y seguir llamando la tool de borrador cuando se pide.
//
// Las marcas del reporte (run.ts, `telegramVerdict`): cuántos mensajes de
// Telegram salen (toTelegramMessages), tablas de más de 3 columnas,
// encabezados, HTML balanceado, card cuando se pidió y voseo.
//
// No corren con la suite cultural normal: solo si AI_SUITE_PROMPTS los pide
// ("telegram-*").

import type { CulturalPrompt } from "./prompts.js";

/**
 * Voseo: cero, en cualquier canal (regla dura #1). Palabra completa: "vos"
 * suelto, no dentro de "objetivos" (la primera corrida lo contó así).
 */
export const VOSEO = /(?<!\p{L})(querés|tenés|podés|sabés|decime|contame|vos)(?!\p{L})/giu;

const telegram = (prompt: Omit<CulturalPrompt, "channel">): CulturalPrompt => ({
  ...prompt,
  channel: "telegram",
});

export const telegramPrompts: CulturalPrompt[] = [
  telegram({
    // Una nota de voz transcrita tal cual (Groq no limpia muletillas).
    id: "telegram-voz-ideas",
    text: "este… eh… ayer en el gym se me ocurrió que podría hacer contenido de, o sea, de las tres cosas que aprendí en mi primer año como freelance de diseño, ¿no? eh… dame tres ideas así concretas para desarrollarlo",
    expectsTool: false,
  }),
  telegram({
    // El flujo del gym del overview: ideas por voz, luego el post.
    id: "telegram-post-linkedin",
    text: "me gusta la segunda, hazme un post de LinkedIn",
    expectsTool: true,
    conversation: {
      history: [
        {
          role: "user",
          text: "dame tres ideas de posts sobre lo que aprendí en mi primer año como freelance de diseño",
        },
        {
          role: "assistant",
          text: "Va, tres ideas:\n\n1. **Cobrar por proyecto, no por hora:** cómo dejaste de regalar tu tiempo.\n2. **El cliente que casi te hace renunciar:** qué aprendiste de poner límites desde el primer correo.\n3. **Tu portafolio no es tu Instagram:** por qué tus mejores clientes llegaron por recomendación.",
        },
      ],
    },
  }),
  telegram({
    // Tienta una tabla de 5 columnas; el apéndice pide no pasar de 3. Con los
    // datos en el mensaje: sin ellos, los modelos buscaban, la búsqueda de la
    // suite no traía nada y nadie armaba tabla (la primera corrida).
    id: "telegram-tabla",
    text: "te paso lo que anoté de 5 cafeterías para trabajar, compáramelas para ver cuál me conviene: Café Créme, americano $45, de 7 a 22, wifi sí, estacionamiento no; Manifesto, $55, de 8 a 20, wifi sí, estacionamiento sí; Bengala Kafe, $40, de 8 a 21, wifi sí, estacionamiento no; Rossina, $60, de 9 a 23, wifi no, estacionamiento sí; Latte Lab, $50, de 7 a 21, wifi sí, estacionamiento sí",
    expectsTool: false,
  }),
  telegram({
    id: "telegram-enlace",
    text: "léete esto y dime de qué va, para sacar un post: https://www.diariodeyucatan.com/merida/2026/10/05/la-marquesita-cumple-80-anos",
    expectsTool: false,
    expectsReadLink: true,
  }),
  telegram({
    id: "telegram-busqueda",
    text: "¿cuánto cuesta hoy la entrada al Gran Museo del Mundo Maya? lo quiero poner en un post",
    expectsTool: false,
    expectsWebSearch: true,
    expectsCitation: true,
  }),
  telegram({
    // Un nombre maya mal oído por la transcripción ("Xcanatún" → "ishcanatun").
    // El apéndice pide preguntar cómo se escribe un nombre que importa para el
    // borrador antes de crearlo: lo correcto es preguntar, no la card con el
    // nombre mal (la primera corrida esperaba la card; los tres modelos
    // preguntaron "¿se escribe Xcanatún?", que es lo que se pidió).
    id: "telegram-nombre-raro",
    text: "hazme un post de instagram para la hacienda ishcanatun, este, donde hicimos la sesión de fotos el sábado, quedó bien bonita",
    expectsTool: false,
  }),
  telegram({
    // En Telegram no existen el menú ＋ ni el panel: debe mandarlo a Presencia.
    id: "telegram-botones-web",
    text: "oye y ¿cómo le pongo una imagen al post que me hiciste?",
    expectsTool: false,
    forbidden: ["＋", "usar una que adjuntaste", "panel de la publicación", "menú +"],
  }),
];
