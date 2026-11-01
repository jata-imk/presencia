// Bake-off de transcripción (F11, ADR-030 en construcción).
//
// Las notas de voz son la entrada principal del canal de Telegram (el flujo del
// gym del overview). Antes de elegir el modelo que las transcribe, se mide con
// audio real de un creator del sureste: acento de Mérida, ruido de gym, nombres
// de marca, precios, anglicismos ("post", "reel", "engagement") y lugares mayas.
//
// Entrada: `scripts/transcription-bakeoff/notas/` (fuera de git: es la voz de
// Jose). Cada nota es un audio (.ogg/.oga/.opus de Telegram, .mp3, .m4a, .wav)
// y, al lado, su transcripción correcta escrita a mano con el mismo nombre y
// extensión .txt, con los números en cifras ("45 pesos", "7:30"): los modelos
// los escriben así, y "cuarenta y cinco" contaría como error. Sin .txt la nota
// corre igual, pero sin WER. La forma más fácil de sacarlas: mandarlas como nota
// de voz en Telegram y en Telegram Desktop, clic derecho → Guardar como (.ogg).
//
// Sale:
//  - un reporte markdown en docs/reference/transcripcion/ con WER, latencia y
//    costo por candidato, y cada transcripción junto a la referencia;
//  - una galería a ciegas (out/<fecha>/index.html, fuera de git) para calificar
//    de 1 a 5 cada transcripción con el audio al lado. El botón "Copiar" deja
//    un JSON que se pega de vuelta; el mapa de letras queda en mapa.json.
//
// Uso: pnpm --filter @presencia/api bakeoff:transcripcion
// TRANSCRIBE_BAKEOFF_MODELS="groq:whisper-large-v3-turbo,openai:gpt-4o-mini-transcribe"
// elige los candidatos (default: esos dos, la cadena propuesta). Un `#es` al
// final de una entrada fija el idioma en español en vez de dejar que lo
// detecte (p. ej. "groq:whisper-large-v3-turbo#es").
// Cuesta centavos: 10 notas de un minuto en Groq ≈ $0.007.

import { mkdir, readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { experimental_transcribe as transcribe, type TranscriptionModel } from "ai";
import { costOf } from "../../src/ai/model-prices.js";
import { registrarGasto, splitModelId } from "../gasto-local.js";
import { findRepoRoot } from "../repo-root.js";
import { oggDurationSeconds, wer } from "./medir.js";

// pnpm --filter corre el script con apps/api como cwd.
const NOTAS_DIR = path.resolve("scripts/transcription-bakeoff/notas");
const OUT_ROOT = path.resolve("scripts/transcription-bakeoff/out");
const AUDIO_EXT = new Set([".ogg", ".oga", ".opus", ".mp3", ".m4a", ".wav", ".webm"]);
const MEDIA_TYPE: Record<string, string> = {
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};
const DEFAULT_MODELS = "groq:whisper-large-v3-turbo,openai:gpt-4o-mini-transcribe";

interface Candidato {
  /** Como se escribió en la variable: "groq:whisper-large-v3-turbo#es". */
  etiqueta: string;
  provider: string;
  model: string;
  idioma?: string;
  modelo: TranscriptionModel;
}

interface Nota {
  nombre: string;
  archivo: string;
  mediaType: string;
  data: Uint8Array;
  referencia?: string;
  segundos?: number;
}

interface Pieza {
  nota: string;
  candidato: string;
  status: "ok" | "error";
  texto?: string;
  segundos?: number;
  latenciaMs?: number;
  costUsd?: number | null;
  wer?: number;
  werSinAcentos?: number;
  error?: string;
}

function candidatos(raw: string): Candidato[] {
  const groq = createGroq();
  const openai = createOpenAI();
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((etiqueta) => {
      const [id = etiqueta, idioma] = etiqueta.split("#");
      const { provider, model } = splitModelId(id);
      let modelo: TranscriptionModel;
      if (provider === "groq") modelo = groq.transcription(model);
      else if (provider === "openai") modelo = openai.transcription(model);
      else throw new Error(`Proveedor de transcripción no soportado en el bake-off: ${provider}`);
      return { etiqueta, provider, model, idioma, modelo };
    });
}

async function leerNotas(): Promise<Nota[]> {
  if (!existsSync(NOTAS_DIR)) {
    throw new Error(
      `No existe ${NOTAS_DIR}. Pon ahí las notas de voz (y su .txt con la transcripción correcta).`,
    );
  }
  const archivos = (await readdir(NOTAS_DIR)).sort();
  const notas: Nota[] = [];
  for (const archivo of archivos) {
    const ext = path.extname(archivo).toLowerCase();
    if (!AUDIO_EXT.has(ext)) continue;
    const nombre = path.basename(archivo, ext);
    const data = new Uint8Array(await readFile(path.join(NOTAS_DIR, archivo)));
    const txt = path.join(NOTAS_DIR, `${nombre}.txt`);
    const referencia = existsSync(txt) ? (await readFile(txt, "utf8")).trim() : undefined;
    const segundos =
      ext === ".ogg" || ext === ".oga" || ext === ".opus" ? oggDurationSeconds(data) : undefined;
    notas.push({
      nombre,
      archivo,
      mediaType: MEDIA_TYPE[ext] ?? "audio/ogg",
      data,
      referencia,
      segundos,
    });
  }
  if (notas.length === 0) throw new Error(`No hay audios en ${NOTAS_DIR}.`);
  return notas;
}

function opcionesDeProveedor(c: Candidato): Record<string, Record<string, string>> | undefined {
  if (!c.idioma) return undefined;
  return { [c.provider]: { language: c.idioma } };
}

async function correr(c: Candidato, n: Nota): Promise<Pieza> {
  const inicio = Date.now();
  try {
    const r = await transcribe({
      model: c.modelo,
      audio: n.data,
      providerOptions: opcionesDeProveedor(c),
    });
    const latenciaMs = Date.now() - inicio;
    const segundos = n.segundos ?? r.durationInSeconds ?? undefined;
    const costUsd = segundos
      ? costOf({
          provider: c.provider,
          model: c.model,
          inputTokens: 0,
          outputTokens: 0,
          audioSeconds: segundos,
        })
      : null;
    await registrarGasto({
      script: "bakeoff-transcripcion",
      provider: c.provider,
      model: c.model,
      task: "transcription",
      inputTokens: 0,
      outputTokens: 0,
      audioSeconds: segundos,
    });
    const pieza: Pieza = {
      nota: n.nombre,
      candidato: c.etiqueta,
      status: "ok",
      texto: r.text.trim(),
      segundos,
      latenciaMs,
      costUsd,
    };
    if (n.referencia) {
      pieza.wer = wer(n.referencia, pieza.texto ?? "");
      pieza.werSinAcentos = wer(n.referencia, pieza.texto ?? "", { sinAcentos: true });
    }
    return pieza;
  } catch (error) {
    return {
      nota: n.nombre,
      candidato: c.etiqueta,
      status: "error",
      latenciaMs: Date.now() - inicio,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const pct = (x: number | undefined) => (x === undefined ? "—" : `${(x * 100).toFixed(1)}%`);
const promedio = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;

function reporte(fecha: string, cands: Candidato[], notas: Nota[], piezas: Pieza[]): string {
  const l: string[] = [];
  l.push(`# Bake-off de transcripción · ${fecha}`, "");
  l.push(
    "Notas de voz reales de un creator de Mérida (F11, ADR-030). WER = palabras mal transcritas / palabras de la referencia, " +
      'en minúsculas y sin puntuación; "sin acentos" además ignora tildes (un acento que falta casi nunca cambia el sentido). ' +
      "Las referencias llevan los números en cifras, como los escriben los modelos. Costo con `src/ai/model-prices.ts` (Groq cobra mínimo 10 s por llamada).",
    "",
  );
  l.push(
    `Notas: ${String(notas.length)} · audio total: ${(notas.reduce((a, n) => a + (n.segundos ?? 0), 0) / 60).toFixed(1)} min`,
    "",
  );
  l.push("## Resumen", "");
  l.push("| Candidato | OK | WER | WER sin acentos | Latencia media | Costo total |");
  l.push("|---|---|---|---|---|---|");
  for (const c of cands) {
    const mias = piezas.filter((p) => p.candidato === c.etiqueta);
    const ok = mias.filter((p) => p.status === "ok");
    const w = promedio(ok.flatMap((p) => (p.wer === undefined ? [] : [p.wer])));
    const ws = promedio(
      ok.flatMap((p) => (p.werSinAcentos === undefined ? [] : [p.werSinAcentos])),
    );
    const lat = promedio(ok.map((p) => p.latenciaMs ?? 0));
    const costo = ok.reduce((a, p) => a + (p.costUsd ?? 0), 0);
    l.push(
      `| \`${c.etiqueta}\` | ${String(ok.length)}/${String(mias.length)} | ${pct(w)} | ${pct(ws)} | ${lat === undefined ? "—" : `${(lat / 1000).toFixed(1)} s`} | $${costo.toFixed(4)} |`,
    );
  }
  l.push("", "## Por nota", "");
  for (const n of notas) {
    l.push(`### ${n.nombre}`, "");
    l.push(`Duración: ${n.segundos ? `${n.segundos.toFixed(0)} s` : "desconocida"}`, "");
    if (n.referencia)
      l.push("**Referencia (Jose):**", "", `> ${n.referencia.replace(/\n+/g, " ")}`, "");
    for (const p of piezas.filter((x) => x.nota === n.nombre)) {
      l.push(
        `**\`${p.candidato}\`** · ${p.status === "ok" ? `WER ${pct(p.wer)} (sin acentos ${pct(p.werSinAcentos)}) · ${((p.latenciaMs ?? 0) / 1000).toFixed(1)} s` : "error"}`,
        "",
      );
      l.push(p.status === "ok" ? `> ${p.texto ?? ""}` : `> ❌ ${p.error ?? ""}`, "");
    }
  }
  l.push("## Lectura (Claude)", "", "_Pendiente._", "");
  l.push("## Veredicto (Jose)", "", "- [ ] La calidad alcanza para el flujo del gym", "");
  return l.join("\n");
}

function barajar<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = a[i] as T;
    a[i] = a[j] as T;
    a[j] = x;
  }
  return a;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function galeria(dir: string, notas: Nota[], piezas: Pieza[]): Promise<void> {
  const mapa: Record<string, Record<string, string>> = {};
  const bloques: string[] = [];
  for (const n of notas) {
    await copyFile(path.join(NOTAS_DIR, n.archivo), path.join(dir, n.archivo));
    const mias = barajar(piezas.filter((p) => p.nota === n.nombre && p.status === "ok"));
    const letras: Record<string, string> = {};
    mapa[n.nombre] = letras;
    const filas = mias.map((p, i) => {
      const letra = String.fromCharCode(65 + i);
      letras[letra] = p.candidato;
      const radios = [1, 2, 3, 4, 5]
        .map(
          (v) =>
            `<label><input type="radio" name="${esc(n.nombre)}|${letra}" value="${String(v)}"> ${String(v)}</label>`,
        )
        .join(" ");
      return `<div class="t"><b>${letra}</b><p>${esc(p.texto ?? "")}</p><div>${radios}</div></div>`;
    });
    bloques.push(
      `<section><h2>${esc(n.nombre)}</h2><audio controls src="${esc(n.archivo)}"></audio>${filas.join("")}</section>`,
    );
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Bake-off de transcripción</title>
<style>body{font:15px/1.5 system-ui;max-width:860px;margin:24px auto;padding:0 16px}section{border-bottom:1px solid #ccc;padding:16px 0}.t{background:#f5f5f5;border-radius:8px;padding:8px 12px;margin:8px 0}audio{width:100%}</style>
<h1>Califica cada transcripción (1 = inútil, 5 = perfecta)</h1>
<p>Escucha el audio y califica sin saber qué modelo es cuál. Al final, "Copiar" y pégale el JSON a Claude.</p>
${bloques.join("\n")}
<button id="copiar">Copiar calificaciones</button> <span id="ok"></span>
<script>
document.getElementById('copiar').onclick=async()=>{const r={};for(const i of document.querySelectorAll('input:checked')){const[n,l]=i.name.split('|');(r[n]??={})[l]=Number(i.value)}await navigator.clipboard.writeText(JSON.stringify(r,null,2));document.getElementById('ok').textContent='Copiado'}
</script>`;
  await writeFile(path.join(dir, "index.html"), html, "utf8");
  await writeFile(path.join(dir, "mapa.json"), JSON.stringify(mapa, null, 2), "utf8");
}

async function main() {
  const cands = candidatos(process.env.TRANSCRIBE_BAKEOFF_MODELS ?? DEFAULT_MODELS);
  const notas = await leerNotas();
  const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Merida" });
  console.log(
    `Bake-off de transcripción: ${String(notas.length)} notas × ${String(cands.length)} candidatos`,
  );

  const piezas: Pieza[] = [];
  for (const n of notas) {
    // Los candidatos de una nota van en paralelo; las notas, en fila (tiers gratis).
    const r = await Promise.all(cands.map((c) => correr(c, n)));
    for (const p of r) {
      console.log(
        `[${p.candidato}] ${p.nota}: ${p.status === "ok" ? `WER ${pct(p.wer)}` : `error: ${p.error ?? ""}`}`,
      );
    }
    piezas.push(...r);
  }

  const out = path.join(OUT_ROOT, fecha);
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "piezas.json"), JSON.stringify(piezas, null, 2), "utf8");
  await galeria(out, notas, piezas);

  const reportDir = path.join(findRepoRoot(process.cwd()), "docs/reference/transcripcion");
  await mkdir(reportDir, { recursive: true });
  const archivo = path.join(reportDir, `${fecha}-bakeoff.md`);
  await writeFile(archivo, reporte(fecha, cands, notas, piezas), "utf8");
  console.log(`\nReporte: ${archivo}\nGalería a ciegas: ${path.join(out, "index.html")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
