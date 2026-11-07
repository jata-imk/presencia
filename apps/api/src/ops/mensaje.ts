import { escapeHtml, TELEGRAM_MESSAGE_LIMIT } from "../telegram/telegram-html.js";
import { duracion, type Aviso } from "./alert-state.js";

// El mensaje de un pase de `ops.watch` (F12.8, ADR-031): todas las
// transiciones del pase en un solo mensaje, no uno por alerta. Es para el
// founder, en español y al grano.

const ICONO: Record<Aviso["decision"], string> = {
  nueva: "🔴",
  recordatorio: "🔁",
  resuelta: "✅",
};

const ORDEN: Aviso["decision"][] = ["nueva", "recordatorio", "resuelta"];

function encabezado(aviso: Aviso, ahora: Date): string {
  switch (aviso.decision) {
    case "nueva":
      return aviso.title;
    case "recordatorio":
      return `Sigue: ${aviso.title} (desde hace ${duracion(aviso.since, ahora)})`;
    case "resuelta":
      return `Resuelto: ${aviso.title} (duró ${duracion(aviso.since, ahora)})`;
  }
}

function ordenados(avisos: readonly Aviso[]): Aviso[] {
  return [...avisos].sort((a, b) => ORDEN.indexOf(a.decision) - ORDEN.indexOf(b.decision));
}

export interface MensajeDeOps {
  subject: string;
  /** HTML del subconjunto de Telegram (b, code), ya recortado al tope. */
  telegramHtml: string;
  /** HTML para el correo. */
  emailHtml: string;
}

/**
 * `entorno` dice de dónde viene (el host de la app): el bot de dev y el de
 * prod pueden avisarle al mismo chat, y un aviso de dev no debe asustar.
 */
export function componerMensaje(
  avisos: readonly Aviso[],
  entorno: string,
  ahora: Date,
): MensajeDeOps {
  const lista = ordenados(avisos);
  const nuevas = lista.filter((a) => a.decision === "nueva").length;
  const resumen =
    nuevas > 0
      ? `${String(nuevas)} ${nuevas === 1 ? "alerta nueva" : "alertas nuevas"}`
      : `${String(lista.length)} ${lista.length === 1 ? "aviso" : "avisos"}`;
  const subject = `Presencia · ${entorno} · ${resumen}`;

  const bloques = lista.map((aviso) => {
    const titulo = `${ICONO[aviso.decision]} <b>${escapeHtml(encabezado(aviso, ahora))}</b>`;
    // El detalle de una resuelta es el del último pase en que estuvo prendida:
    // ya no describe el presente, así que no se repite.
    if (aviso.decision === "resuelta" || !aviso.detail) return titulo;
    return `${titulo}\n<code>${escapeHtml(aviso.detail)}</code>`;
  });
  const telegramHtml = recortar(`<b>${escapeHtml(subject)}</b>\n\n${bloques.join("\n\n")}`);

  const emailHtml = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">${[
    `<p><b>${escapeHtml(subject)}</b></p>`,
    ...lista.map((aviso) => {
      const titulo = `<p>${ICONO[aviso.decision]} <b>${escapeHtml(encabezado(aviso, ahora))}</b></p>`;
      if (aviso.decision === "resuelta" || !aviso.detail) return titulo;
      return `${titulo}<pre style="white-space:pre-wrap">${escapeHtml(aviso.detail)}</pre>`;
    }),
  ].join("")}</div>`;

  return { subject, telegramHtml, emailHtml };
}

/**
 * Telegram rechaza el mensaje entero si pasa de 4096 caracteres. Cada detalle
 * ya viene acotado (MAX_DETALLE, en alert-state.ts), así que lo único que puede desbordar es un
 * pase con muchas alertas: se cortan bloques completos del final (nunca a la
 * mitad de una etiqueta) y se dice cuántos quedaron fuera.
 */
export function recortar(html: string, limite = TELEGRAM_MESSAGE_LIMIT): string {
  if (html.length <= limite) return html;
  // El primer bloque es el encabezado: siempre se queda.
  const bloques = html.split("\n\n");
  for (let n = bloques.length - 1; n >= 1; n -= 1) {
    const texto = `${bloques.slice(0, n).join("\n\n")}\n\n… y ${String(bloques.length - n)} más (el log del worker los trae todos)`;
    if (texto.length <= limite || n === 1) return texto;
  }
  return html;
}
