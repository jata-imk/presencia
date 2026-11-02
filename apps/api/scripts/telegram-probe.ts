// Sonda de F11 (ADR-030 en construcción): ¿el Telegram de hoy aguanta "1 tema = 1 chat"?
//
// El plan de F11 se apoya en piezas del Bot API posteriores al corte de
// conocimiento del modelo que lo escribió, leídas en la spec cruda
// (core.telegram.org/bots/api, 10.3 del 2026-08-24):
//  - temas en el chat privado con un bot (9.3/9.4): el bot y el usuario los crean;
//  - `sendMessageDraft` / `sendRichMessageDraft` con `can_stop` (9.5, 10.1, 10.3) y
//    el update `stopped_message_generation`;
//  - rich messages (`sendRichMessage`, 10.1) con markdown, tablas y bloques plegables.
// Que la spec lo diga no dice que los clientes lo pinten bien. Esta sonda lo
// prueba con un bot de verdad (el de dev) y le pide a Jose cada acción que solo
// puede hacer una persona (crear un tema, apretar "detener", mandar una nota de voz).
// Es la compuerta del PR1: si los temas o el rich fallan, F11 se replantea.
//
// Uso: pnpm --filter @presencia/api sonda:telegram
// Necesita TELEGRAM_BOT_TOKEN (el bot de DEV, nunca el de prod: la sonda borra
// su webhook para leer con getUpdates) y el modo temas prendido en BotFather.
// Va pidiendo cada paso en la consola; un paso humano que no llega a tiempo se
// anota como "sin respuesta" y la sonda sigue. Reporte en docs/reference/telegram/.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { findRepoRoot } from "./repo-root.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("Falta TELEGRAM_BOT_TOKEN (el bot de dev) en el .env");

interface Respuesta {
  ok: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
}
type Update = Record<string, unknown> & { update_id: number };

interface Paso {
  titulo: string;
  llamadas: { metodo: string; params: string; ok: boolean; detalle: string }[];
  updates: unknown[];
  nota?: string;
}

const pasos: Paso[] = [];
let actual: Paso | undefined;

function paso(titulo: string): void {
  actual = { titulo, llamadas: [], updates: [] };
  pasos.push(actual);
  console.log(`\n=== ${titulo}`);
}

function anota(nota: string): void {
  if (actual) actual.nota = actual.nota ? `${actual.nota} ${nota}` : nota;
  console.log(`   ${nota}`);
}

const recorta = (v: unknown, max = 900) => {
  const s = JSON.stringify(v, sinDatosPersonales);
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

async function api(metodo: string, params: Record<string, unknown> = {}): Promise<Respuesta> {
  // Nunca tira: un 502 en HTML o la red caída a media sonda no puede perder
  // los pasos que Jose ya hizo a mano (el reporte se escribe al final).
  let json: Respuesta;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    json = (await res.json()) as Respuesta;
  } catch (error) {
    json = { ok: false, description: error instanceof Error ? error.message : String(error) };
  }
  // Los textos largos no van completos al reporte: lo que importa es si pasó.
  const visibles = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [
      k,
      typeof v === "string" && v.length > 120
        ? `${v.slice(0, 120)}… (${String(v.length)} caracteres)`
        : v,
    ]),
  );
  if (metodo !== "getUpdates") {
    actual?.llamadas.push({
      metodo,
      params: recorta(visibles, 500),
      ok: json.ok,
      detalle: json.ok
        ? recorta(json.result, 600)
        : `${String(json.error_code)} ${json.description ?? ""}`,
    });
    console.log(
      `   ${json.ok ? "✓" : "✗"} ${metodo}${json.ok ? "" : `: ${json.description ?? ""}`}`,
    );
  }
  return json;
}

// --- Lectura de updates en segundo plano (la prueba de "detener" necesita
// escuchar mientras el draft corre).
const cola: Update[] = [];
let offset = 0;
let leyendo = true;

async function leer(): Promise<void> {
  while (leyendo) {
    const r = await api("getUpdates", {
      offset,
      timeout: 20,
      allowed_updates: ["message", "callback_query", "stopped_message_generation"],
    });
    if (r.ok && Array.isArray(r.result)) {
      for (const u of r.result as Update[]) {
        offset = u.update_id + 1;
        cola.push(u);
      }
    } else {
      // 409 (otro proceso leyendo el mismo bot), 401 o sin red: sin pausa,
      // el ciclo martillaría a Telegram y se comería un núcleo.
      if (r.error_code === 409) console.warn("   ⚠️ Otro proceso lee este bot (¿la API de dev?).");
      await dormir(1000);
    }
  }
}

async function espera(
  instruccion: string,
  pred: (u: Update) => boolean,
  segundos = 120,
): Promise<Update | undefined> {
  if (instruccion) console.log(`\n👉 ${instruccion} (tienes ${String(segundos)} s)`);
  const fin = Date.now() + segundos * 1000;
  while (Date.now() < fin) {
    const i = cola.findIndex(pred);
    if (i !== -1) {
      const [u] = cola.splice(i, 1);
      actual?.updates.push(u);
      return u;
    }
    await dormir(300);
  }
  anota("Sin respuesta a tiempo.");
  return undefined;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msg = (u: Update) => u.message as Record<string, unknown> | undefined;
const texto = (u: Update) => (msg(u)?.text as string | undefined) ?? "";

// --- Contenidos de prueba (lo que el chat de Presencia mandaría de verdad).

const RESPUESTA = [
  "Va, aquí tienes **3 ideas** para tu post de hoy, pensadas para tu cafetería en el centro de Mérida:",
  "",
  "1. **El ritual del café de olla** — muestra cómo lo preparas en la mañana, con el vapor y la canela.",
  "2. **Antes y después del calor** — tu frappé del mediodía vs. el expreso de las 7 a.m.",
  "3. **Clientes de siempre** — una mini entrevista con don Ramiro, que viene desde 2019.",
  "",
  "¿Cuál te late? Te armo el post completo.",
].join("\n");

const RICH = [
  "## Plan de la semana",
  "",
  "Esto es lo que te propongo publicar, con *horarios* que ya te funcionaron:",
  "",
  "| Día | Red | Idea | Hora |",
  "|:----|:----|:-----|-----:|",
  "| Lunes | Instagram | Café de olla | 8:00 |",
  "| Miércoles | LinkedIn | Historia del local | 12:30 |",
  "| Viernes | TikTok | Frappé vs. expreso | 18:00 |",
  "",
  "> Tip: los viernes en la tarde tu engagement sube ~20%.",
  "",
  "<details><summary>🎤 Escuché: «oye, hazme ideas para la semana…»</summary>",
  "Oye, este… hazme ideas para la semana, que ya casi no publico, y que una sea de LinkedIn.",
  "</details>",
  "",
  "**Fuentes**",
  "- [Diario de Yucatán · consumo de café](https://www.yucatan.com.mx)",
  "",
  '<tg-button-row><tg-button type="url" url="https://presencia.josetejero.com">Abrir en Presencia</tg-button></tg-button-row>',
].join("\n");

const HTML = [
  "<b>Respaldo en HTML</b> (si el rich no sirviera): <i>cursiva</i>, <code>código</code>, ",
  '<a href="https://presencia.josetejero.com">un link</a>.',
  "<blockquote expandable>🎤 Escuché: «oye, este… hazme ideas para la semana, que ya casi no publico, y que una sea de LinkedIn». ",
  "Este bloque es plegable y debería abrirse al tocarlo.</blockquote>",
].join("");

async function streamDraft(
  chatId: number,
  threadId: number | undefined,
  draftId: number,
  completo: string,
  {
    rich = false,
    pausaMs = 350,
    canStop = true,
    detenido,
  }: { rich?: boolean; pausaMs?: number; canStop?: boolean; detenido?: () => boolean } = {},
): Promise<{ llamadas: number; fallos: number; detenido: boolean }> {
  const palabras = completo.split(/(\s+)/);
  let enviado = "";
  let llamadas = 0;
  let fallos = 0;
  const metodo = rich ? "sendRichMessageDraft" : "sendMessageDraft";
  const base = {
    chat_id: chatId,
    message_thread_id: threadId,
    draft_id: draftId,
    can_stop: canStop,
  };
  // Primero el "Thinking…" (texto vacío) mientras "piensa".
  const r0 = await api(
    metodo,
    rich
      ? { ...base, rich_message: { markdown: "<tg-thinking>Pensando…</tg-thinking>" } }
      : { ...base, text: "" },
  );
  llamadas++;
  if (!r0.ok) fallos++;
  await dormir(1500);
  for (let i = 0; i < palabras.length; i += 6) {
    if (detenido?.()) return { llamadas, fallos, detenido: true };
    enviado += palabras.slice(i, i + 6).join("");
    const r = await api(
      metodo,
      rich ? { ...base, rich_message: { markdown: enviado } } : { ...base, text: enviado },
    );
    llamadas++;
    if (!r.ok) {
      fallos++;
      if (r.error_code === 429) await dormir(2000);
    }
    await dormir(pausaMs);
  }
  return { llamadas, fallos, detenido: false };
}

// El reporte se versiona: los updates traen el nombre, el usuario y el id de
// Telegram de quien probó, y los file_id. Se ocultan; la forma del update es
// lo que importa.
const PERSONALES = new Set([
  "first_name",
  "last_name",
  "username",
  "phone_number",
  "language_code",
]);
function sinDatosPersonales(clave: string, valor: unknown): unknown {
  if (PERSONALES.has(clave)) return "‹oculto›";
  if (
    (clave === "id" || clave === "chat_id") &&
    typeof valor === "number" &&
    Math.abs(valor) > 100_000
  )
    return "‹id›";
  // Ids estables por usuario que llegan como string.
  if (clave === "callback_query_id" || clave === "chat_instance") return "‹id›";
  if (clave === "id" && typeof valor === "string" && /^\d{6,}$/.test(valor)) return "‹id›";
  if (
    (clave === "file_id" || clave === "file_unique_id" || clave === "file_path") &&
    typeof valor === "string"
  )
    return "‹archivo›";
  return valor;
}

function reporte(fecha: string, me: unknown): string {
  const l: string[] = [];
  l.push(`# Sonda de Telegram · ${fecha}`, "");
  l.push(
    'Compuerta del PR1 de F11 (ADR-030): ¿aguanta el Telegram de hoy "1 tema = 1 chat", el streaming con detener y los rich messages? ' +
      "Corrida con el bot de dev por `pnpm --filter @presencia/api sonda:telegram`. El token no aparece en el reporte.",
    "",
  );
  // Del bot solo se oculta el id: es el prefijo de su token.
  const meVisible = JSON.stringify(me, (k: string, v: unknown) => (k === "id" ? "‹id›" : v), 2);
  l.push("## getMe", "", "```json", meVisible, "```", "");
  l.push("## Pasos", "");
  for (const p of pasos) {
    l.push(`### ${p.titulo}`, "");
    if (p.nota) l.push(`_${p.nota}_`, "");
    for (const c of p.llamadas) {
      l.push(
        `- ${c.ok ? "✅" : "❌"} \`${c.metodo}\` ${c.params}`,
        `  - ${c.ok ? "→" : "error:"} \`${c.detalle.replace(/`/g, "'")}\``,
      );
    }
    for (const u of p.updates)
      l.push(
        "",
        "Update recibido:",
        "",
        "```json",
        JSON.stringify(u, sinDatosPersonales, 2),
        "```",
      );
    l.push("");
  }
  l.push("## Checklist por cliente (Jose)", "");
  l.push("| Qué se ve | Android | iOS | Desktop |", "|---|---|---|---|");
  for (const fila of [
    "Los temas aparecen como lista dentro del chat del bot",
    "Puedo crear un tema nuevo yo",
    "El tema creado por el bot aparece con su nombre",
    "El renombre del tema (autotítulo) se ve",
    'Draft: el "Pensando…" y el texto que se va escribiendo',
    "Draft: el botón de detener aparece y funciona",
    "Rich: encabezado, negritas y lista",
    "Rich: la tabla se lee bien en el ancho del teléfono",
    'Rich: el bloque plegable "🎤 Escuché" se abre al tocarlo',
    'Rich: el botón "Abrir en Presencia" abre el link',
    "Rich largo (> 4,096 caracteres) llega completo",
    "HTML de respaldo: el blockquote plegable",
    "Card como foto con caption y botón",
    "Notificación: llega una sola, con la respuesta final (no con el draft)",
  ]) {
    l.push(`| ${fila} | [ ] | [ ] | [ ] |`);
  }
  l.push(
    "",
    "## Lectura (Claude)",
    "",
    "_Pendiente._",
    "",
    "## Veredicto (Jose)",
    "",
    "- [ ] Seguimos con temas = chats",
    "",
  );
  return l.join("\n");
}

async function main() {
  paso("1. El bot y el modo temas");
  const me = await api("getMe");
  if (!me.ok) throw new Error(`getMe falló: ${me.description ?? ""}`);
  const bot = me.result as {
    username: string;
    has_topics_enabled?: boolean;
    allows_users_to_create_topics?: boolean;
  };
  anota(
    `@${bot.username} · has_topics_enabled=${String(bot.has_topics_enabled)} · allows_users_to_create_topics=${String(bot.allows_users_to_create_topics)}`,
  );
  if (!bot.has_topics_enabled) {
    anota(
      "⚠️ El modo temas está apagado: prenderlo en BotFather (Bot Settings → Mini App de ajustes) y volver a correr.",
    );
  }

  paso("2. Leer con getUpdates (sin webhook)");
  await api("deleteWebhook", { drop_pending_updates: true });
  await api("getWebhookInfo");
  void leer();

  paso("3. /start: el chat privado con el bot");
  const start = await espera(`Abre t.me/${bot.username} y manda /start`, (u) =>
    texto(u).startsWith("/start"),
  );
  if (!start) throw new Error("Sin /start no hay chat para probar.");
  const chatId = (msg(start)?.chat as { id: number }).id;

  paso('4. Tema creado por el bot ("Continuar en Telegram")');
  const tema = await api("createForumTopic", {
    chat_id: chatId,
    name: "Sonda F11 · creado por el bot",
  });
  const temaBot = (tema.result as { message_thread_id?: number } | undefined)?.message_thread_id;
  if (temaBot)
    await api("sendMessage", {
      chat_id: chatId,
      message_thread_id: temaBot,
      text: "Seguimos con «Sonda F11». Este tema lo creé yo.",
    });

  paso('5. Tema creado por el usuario ("tema nuevo = chat nuevo")');
  const propio = await espera(
    "Crea TÚ un tema nuevo en el chat del bot (sin ponerle nombre si te deja) y manda «hola desde mi tema»",
    (u) => texto(u).toLowerCase().includes("hola desde mi tema"),
    180,
  );
  const temaUsuario = msg(propio ?? ({} as Update))?.message_thread_id as number | undefined;
  // Los service messages de forum_topic_created que hayan llegado (is_name_implicit).
  for (let i = cola.length - 1; i >= 0; i--) {
    if (msg(cola[i] as Update)?.forum_topic_created) actual?.updates.push(...cola.splice(i, 1));
  }
  anota(`message_thread_id del tema del usuario: ${String(temaUsuario)}`);

  paso("6. Mensaje fuera de cualquier tema");
  await espera(
    "Ahora manda «fuera de tema» desde la vista principal del chat, fuera de cualquier tema (si tu app no te deja, espera)",
    (u) => texto(u).toLowerCase().includes("fuera de tema"),
    90,
  );

  const destino = temaUsuario ?? temaBot;

  paso("7. Escribiendo… y draft de texto en el tema");
  await api("sendChatAction", { chat_id: chatId, message_thread_id: destino, action: "typing" });
  // Texto plano: el markdown va en el paso 8, con el rich.
  const plano = RESPUESTA.replace(/\*\*/g, "");
  const d1 = await streamDraft(chatId, destino, 1, plano);
  anota(`Draft de texto: ${String(d1.llamadas)} llamadas, ${String(d1.fallos)} fallos.`);
  await api("sendMessage", { chat_id: chatId, message_thread_id: destino, text: plano });

  paso("8. Draft rich y respuesta final rich (tabla, plegable, botón)");
  const d2 = await streamDraft(chatId, destino, 2, RICH, { rich: true });
  anota(`Draft rich: ${String(d2.llamadas)} llamadas, ${String(d2.fallos)} fallos.`);
  await api("sendRichMessage", {
    chat_id: chatId,
    message_thread_id: destino,
    rich_message: { markdown: RICH },
  });

  paso("9. Detener a media respuesta");
  console.log("\n👉 Va una respuesta larga y lenta: aprieta el botón de detener del draft.");
  let parado: Update | undefined;
  const largo = Array.from(
    { length: 40 },
    (_, i) => `Idea ${String(i + 1)}: una línea más para que dé tiempo de detenerme.`,
  ).join("\n");
  const d3 = await streamDraft(chatId, destino, 3, largo, {
    pausaMs: 900,
    detenido: () => {
      const i = cola.findIndex((u) => "stopped_message_generation" in u);
      if (i !== -1) parado = cola.splice(i, 1)[0];
      return parado !== undefined;
    },
  });
  if (parado) actual?.updates.push(parado);
  anota(
    d3.detenido
      ? "Llegó stopped_message_generation: el turno se habría guardado como detenido."
      : "No llegó el update de detener.",
  );
  await api("sendMessage", {
    chat_id: chatId,
    message_thread_id: destino,
    text: d3.detenido ? "Me detuve." : "Terminé sin que me detuvieras.",
  });

  paso("10. Renombrar el tema (autotítulo)");
  if (destino)
    await api("editForumTopic", {
      chat_id: chatId,
      message_thread_id: destino,
      name: "Ideas de café de olla para la semana",
    });

  paso("11. Rich largo (> 4,096 caracteres)");
  const parrafo =
    "Este párrafo se repite para pasar del límite de 4,096 caracteres de un mensaje normal y ver si el rich lo manda completo en uno solo. ";
  await api("sendRichMessage", {
    chat_id: chatId,
    message_thread_id: destino,
    rich_message: {
      markdown: `## Mensaje largo\n\n${Array.from({ length: 50 }, (_, i) => `${String(i + 1)}. ${parrafo}`).join("\n")}\n\n**Fin del mensaje largo.**`,
    },
  });

  paso("12. Respaldo en HTML (blockquote plegable)");
  await api("sendMessage", {
    chat_id: chatId,
    message_thread_id: destino,
    text: HTML,
    parse_mode: "HTML",
  });

  paso("13. Card como foto con caption y botones");
  await api("sendPhoto", {
    chat_id: chatId,
    message_thread_id: destino,
    photo: "https://telegram.org/img/t_logo.png",
    caption:
      "<b>Instagram · Borrador</b>\n\n☕ El ritual del café de olla empieza a las 7…\n\n#Mérida #CaféDeOlla",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Abrir en Presencia", url: "https://presencia.josetejero.com" }],
        [{ text: "Reintentar", callback_data: "sonda:reintentar" }],
      ],
    },
  });
  const cb = await espera(
    "Aprieta el botón «Reintentar» de la card",
    (u) => "callback_query" in u,
    90,
  );
  if (cb)
    await api("answerCallbackQuery", {
      callback_query_id: (cb.callback_query as { id: string }).id,
      text: "Recibido",
    });

  paso("14. Nota de voz (forma del update para el PR de audio)");
  const voz = await espera(
    "Manda una nota de voz corta en el tema",
    (u) => Boolean(msg(u)?.voice),
    120,
  );
  const fileId = (msg(voz ?? ({} as Update))?.voice as { file_id?: string } | undefined)?.file_id;
  if (fileId) await api("getFile", { file_id: fileId });

  paso("15. Álbum de fotos (forma del update para el PR de adjuntos)");
  await espera(
    "Manda 2 fotos juntas (un álbum) con un texto",
    (u) => Boolean(msg(u)?.media_group_id),
    120,
  );
  await dormir(2000);
  for (let i = cola.length - 1; i >= 0; i--) {
    if (msg(cola[i] as Update)?.media_group_id) actual?.updates.push(...cola.splice(i, 1));
  }

  paso("16. Borrar el tema del bot (limpieza)");
  if (temaBot) await api("deleteForumTopic", { chat_id: chatId, message_thread_id: temaBot });

  leyendo = false;
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Merida" });
  const dir = path.join(findRepoRoot(process.cwd()), "docs/reference/telegram");
  await mkdir(dir, { recursive: true });
  // Una corrida por cliente el mismo día no pisa la anterior: -2, -3…
  let archivo = path.join(dir, `${fecha}-sonda.md`);
  for (let n = 2; existsSync(archivo); n++)
    archivo = path.join(dir, `${fecha}-sonda-${String(n)}.md`);
  await writeFile(archivo, reporte(fecha, me.result), "utf8");
  console.log(
    `\nReporte: ${archivo}\nLlena el checklist por cliente con lo que viste en cada app.`,
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
