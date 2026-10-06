// Bake-off de generadores de imagen (F10, ADR-025; ampliado en F10.7).
//
// Corre los mismos prompts —escritos como los escribiría el chat para un
// creator del sureste— contra cada modelo, con el MISMO adapter y el MISMO
// prompt compuesto de producción (AiSdkImageProvider + composeImagePrompt), y
// deja:
//   - una galería a ciegas para calificar (out/<corrida>/index.html): por
//     prompt, los modelos en columnas barajadas (A, B, C…), dos variantes cada
//     uno como en la card, ya recortadas a la proporción que vería el creator;
//   - un reporte markdown con latencia, medidas, costo y bloqueos por imagen.
// El juicio de calidad es humano: se califica en la galería y se pega el JSON.
//
// Uso: pnpm --filter @presencia/api bakeoff:imagenes
// IMAGE_BAKEOFF_MODELS="google:x,openai:y" cambia los modelos.
// IMAGE_BAKEOFF_PROMPTS="id1,id2" re-corre solo esos prompts.
// IMAGE_BAKEOFF_VARIANTS=1 genera una imagen por prompt en vez de dos.
//
// Cuesta dinero de verdad (~$5–8 la corrida completa de F10.7: 12 prompts × 2
// variantes × 5 modelos). Las imágenes NO se versionan: caen en
// scripts/image-bakeoff/out/ (en .gitignore). El reporte sí, en
// docs/reference/bakeoff-imagenes/.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { costOf } from "../../src/ai/model-prices.js";
import { createImageModelResolver } from "../../src/ai/provider-registry.js";
import { AiSdkImageProvider } from "../../src/images/ai-sdk-image.provider.js";
import { fitToAspect } from "../../src/images/image-fit.js";
import type { ImageAspectRatio, ImageRequest } from "../../src/images/image-provider.js";
import { composeEditPrompt, composeImagePrompt } from "../../src/images/image-prompt.js";
import { registrarGasto, splitModelId } from "../gasto-local.js";

// Los candidatos de F10.7 (docs/reference/modelos-de-imagen-2026-09.md):
// Grok Imagine 2.0 (principal propuesto), Muse y MAI-Image por OpenRouter,
// Nano Banana 2 (el de hoy, control) y gpt-image-2 (el alternativo de hoy).
const DEFAULT_MODELS = [
  "xai:grok-imagine-image-2.0",
  "openrouter:meta/muse-image",
  "openrouter:microsoft/mai-image-2.6",
  "google:gemini-3.1-flash-image",
  "openai:gpt-image-2",
];

interface BakeoffPrompt {
  id: string;
  aspectRatio: ImageAspectRatio;
  /** Lo que escribiría el chat (el "qué se ve"); se compone como en producción. */
  description: string;
  /**
   * Se manda tal cual, sin componer. Solo las pruebas de texto: el prompt
   * compuesto siempre pide "sin texto", y lo que se mide ahí es si el
   * generador escribe bien cuando el creator lo pide.
   */
  raw?: boolean;
  /** Si está, se edita la primera variante que produjo ese prompt. */
  editOf?: string;
  /** Qué mirar en este prompt al calificar. */
  mirar: string;
}

const PROMPTS: BakeoffPrompt[] = [
  {
    id: "marquesitas",
    aspectRatio: "4:5",
    description:
      "Un puesto de marquesitas en el Paseo de Montejo de Mérida al atardecer, con el vendedor preparando una marquesita con queso de bola.",
    mirar: "¿Se reconoce el Paseo de Montejo? ¿La marquesita es una marquesita?",
  },
  {
    id: "cafe-centro",
    aspectRatio: "4:5",
    description:
      "Taza de café de olla sobre una mesa de madera en una cafetería del centro histórico de Mérida, paredes de colores y mosaico de pasta al fondo.",
    mirar: "Mosaico de pasta y paredes del centro; café de olla creíble.",
  },
  {
    id: "nutriologa",
    aspectRatio: "1:1",
    description:
      "Plato de desayuno saludable mexicano: chilaquiles verdes horneados con pollo, aguacate y frijoles, vista cenital, para una nutrióloga.",
    mirar: "Comida mexicana real, no genérica; vista cenital.",
  },
  {
    id: "inmobiliaria",
    aspectRatio: "4:5",
    description:
      "Fachada de una casa colonial restaurada en el barrio de Santiago en Mérida, con puerta de madera y herrería, cielo despejado.",
    mirar: "Arquitectura yucateca, no colonial genérica.",
  },
  {
    id: "gym",
    aspectRatio: "4:5",
    description:
      "Mujer de 30 años entrenando con mancuernas en un gimnasio pequeño de barrio, energía y esfuerzo, sin marcas de ropa visibles.",
    mirar: "Persona creíble (manos, cara); sin logos en la ropa.",
  },
  {
    id: "linkedin-equipo",
    aspectRatio: "1:1",
    description:
      "Equipo pequeño de una agencia de marketing en Monterrey conversando alrededor de una laptop en una oficina luminosa.",
    mirar: "Personas naturales, sin logos en la laptop.",
  },
  {
    id: "x-cenote",
    aspectRatio: "16:9",
    description:
      "Cenote de Yucatán visto desde arriba con agua turquesa y raíces colgando, una persona flotando.",
    mirar: "Cenote real, proporción 16:9.",
  },
  {
    id: "tiendita-sin-logos",
    aspectRatio: "4:5",
    // F10.7: el prompt que más tienta a dibujar marcas (refrescos, botanas).
    description:
      "Refrigerador de refrescos y estante de botanas en una tiendita de la esquina en Mérida, luz de la tarde entrando por la puerta.",
    mirar: "¿Metió marcas reconocibles? Eso descalifica (así cayó Flash Lite en F10).",
  },
  {
    id: "texto-en-imagen",
    aspectRatio: "1:1",
    raw: true,
    // Control de F10: pide texto exacto en mayúsculas.
    description:
      "Cartel de promoción de una taquería que diga exactamente 'MARTES DE 2X1 EN TACOS DE COCHINITA', estilo cartel pintado a mano mexicano.",
    mirar: "¿El texto dice exactamente eso, sin letras de más ni de menos?",
  },
  {
    id: "pizarron-espanol",
    aspectRatio: "4:5",
    raw: true,
    // F10.7: acentos y signos, que es donde fallan.
    description:
      "Pizarrón de gis en la entrada de un puesto de marquesitas que diga exactamente: 'Marquesitas de cajeta y queso de bola · 2×1 los martes'. Fotografía natural, luz cálida, Mérida.",
    mirar: "Acentos, la ×, el punto medio; sin palabras inventadas.",
  },
  {
    id: "marquesitas-calida",
    aspectRatio: "4:5",
    editOf: "marquesitas",
    description:
      "Hazla más cálida y quita a las personas del fondo; conserva el puesto y la composición.",
    mirar: "Edición fiel: misma escena, más cálida, sin gente al fondo.",
  },
  {
    id: "cafe-minimalista",
    aspectRatio: "4:5",
    editOf: "cafe-centro",
    description:
      "Cambia el fondo por una pared lisa color terracota, estilo minimalista; conserva la taza.",
    mirar: "Edición fiel: la misma taza, fondo terracota liso.",
  },
];

// pnpm --filter corre el script con apps/api como cwd.
const OUT_ROOT = path.resolve("scripts/image-bakeoff/out");
const REPORT_DIR = path.resolve("../../docs/reference/bakeoff-imagenes");

function extension(mediaType: string) {
  return mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
}

function promptFor(p: BakeoffPrompt): string {
  if (p.raw) return p.description;
  return p.editOf ? composeEditPrompt(p.description) : composeImagePrompt(p.description, null);
}

interface Pieza {
  promptId: string;
  model: string;
  variant: number;
  status: "ok" | "bloqueada" | "error" | "sin base";
  file?: string;
  original?: string;
  final?: string;
  segundos?: number;
  costUsd?: number | null;
  nota?: string;
}

async function medidas(data: Uint8Array): Promise<string> {
  const { width, height } = await sharp(data).metadata();
  return `${String(width ?? "?")}×${String(height ?? "?")}`;
}

/** El costo que cobró el proveedor si lo reporta (OpenRouter), si no la tabla de precios. */
function costo(model: string, raw: unknown, input: number, output: number): number | null {
  const reportado = (raw as { providerMetadata?: { openrouter?: { cost?: number | null } } })
    ?.providerMetadata?.openrouter?.cost;
  if (typeof reportado === "number") return reportado;
  return costOf({
    ...splitModelId(model),
    inputTokens: input,
    outputTokens: output,
    imagesCount: 1,
  });
}

async function correrModelo(
  modelId: string,
  prompts: BakeoffPrompt[],
  variants: number,
  runDir: string,
  fecha: string,
): Promise<Pieza[]> {
  const resolve = createImageModelResolver(process.env);
  const provider = new AiSdkImageProvider(resolve(modelId), modelId);
  const slug = modelId.replace(/[:/]/g, "_");
  const piezas: Pieza[] = [];
  // La primera variante que salió de cada prompt, YA recortada: en producción
  // se edita el asset guardado, que image-fit ya llevó a la proporción.
  const bases = new Map<string, { data: Uint8Array; mediaType: string }>();

  for (const p of prompts) {
    const cuantas = p.editOf ? 1 : variants;
    for (let variant = 1; variant <= cuantas; variant++) {
      const request: ImageRequest = { prompt: promptFor(p), aspectRatio: p.aspectRatio };
      if (p.editOf) {
        const base = bases.get(p.editOf);
        if (!base) {
          piezas.push({ promptId: p.id, model: modelId, variant, status: "sin base" });
          continue;
        }
        request.reference = base;
      }
      const arranque = Date.now();
      try {
        const result = await provider.generate(request);
        const segundos = (Date.now() - arranque) / 1000;
        const input = result.usage?.inputTokens ?? 0;
        const output = result.usage?.outputTokens ?? 0;
        if (result.usage) {
          await registrarGasto({
            script: "bakeoff",
            ...splitModelId(modelId),
            task: request.reference ? "image_edit" : "image_generate",
            inputTokens: input,
            outputTokens: output,
            imagesCount: result.kind === "blocked" ? 0 : 1,
          });
        }
        if (result.kind === "blocked") {
          piezas.push({ promptId: p.id, model: modelId, variant, status: "bloqueada", segundos });
          console.log(`[${modelId}] ${p.id} v${String(variant)}: bloqueada`);
          continue;
        }
        // Lo que vería el creator: recortada a la proporción de la card,
        // como hace image-fit.ts al guardarla.
        const final = await fitToAspect(result.data, p.aspectRatio);
        if (!bases.has(p.id)) bases.set(p.id, { data: final, mediaType: result.mediaType });
        const file = `${p.id}__${slug}__v${String(variant)}.${extension(result.mediaType)}`;
        await writeFile(path.join(runDir, file), final);
        await writeFile(path.join(runDir, "originales", `${fecha}_${file}`), result.data);
        piezas.push({
          promptId: p.id,
          model: modelId,
          variant,
          status: "ok",
          file,
          original: await medidas(result.data),
          final: await medidas(final),
          segundos,
          costUsd: costo(modelId, result.providerRaw, input, output),
        });
        console.log(`[${modelId}] ${p.id} v${String(variant)}: ok ${segundos.toFixed(1)} s`);
      } catch (error) {
        const nota =
          error instanceof Error ? error.message.replace(/\|/g, "/").slice(0, 200) : String(error);
        piezas.push({
          promptId: p.id,
          model: modelId,
          variant,
          status: "error",
          segundos: (Date.now() - arranque) / 1000,
          nota,
        });
        console.error(`[${modelId}] ${p.id} v${String(variant)}: error ${nota}`);
      }
    }
  }
  return piezas;
}

function galeria(
  runId: string,
  prompts: BakeoffPrompt[],
  models: string[],
  piezas: Pieza[],
): string {
  const datos = {
    runId,
    models,
    prompts: prompts.map((p) => ({
      id: p.id,
      aspect: p.aspectRatio,
      description: p.description,
      mirar: p.mirar,
      editOf: p.editOf ?? null,
    })),
    piezas,
  };
  // Página local, fuera del producto: estilos en línea, sin tokens ni build.
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bake-off ${runId}</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#f6f3f7;color:#2b1f30}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:12px 20px;z-index:2;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
header h1{font-size:18px;margin:0 12px 0 0}
button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #aaa;background:#fff;cursor:pointer}
button.on{background:#3d2347;color:#fff;border-color:#3d2347}
.criterios{font-size:13px;color:#555;padding:8px 20px}
section{padding:16px 20px;border-bottom:1px solid #e3dbe7}
section h2{font-size:16px;margin:0 0 4px}
.desc{font-size:13px;color:#444;margin:0 0 4px}.mirar{font-size:13px;color:#7a3b8f;margin:0 0 12px}
.fila{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.celda{background:#fff;border-radius:12px;padding:10px;border:2px solid transparent}
.celda h3{margin:0 0 8px;font-size:15px}
.imgs{display:flex;gap:6px}.imgs img{width:50%;height:auto;border-radius:6px;cursor:zoom-in;background:#eee}
.falla{font-size:12px;color:#b00;padding:20px 0}
.meta{font-size:11px;color:#777;margin-top:6px;min-height:14px}
.score{display:flex;gap:4px;margin-top:8px}.score button{padding:4px 10px}
textarea{width:100%;box-sizing:border-box;margin-top:6px;font:inherit;font-size:13px;min-height:38px}
.modelo{display:none;font-size:12px;color:#3d2347;font-weight:600}.revelado .modelo{display:inline}
.revelado .meta{color:#333}
dialog{border:0;padding:0;background:transparent}dialog img{max-width:92vw;max-height:92vh}
</style></head><body>
<header><h1>Bake-off de imágenes · ${runId}</h1>
<button id="revelar">Revelar modelos</button>
<button id="copiar">Copiar resultados</button><span id="estado" style="font-size:13px;color:#555"></span></header>
<p class="criterios">Califica cada columna de 1 a 5 mirando las dos variantes: <b>lugar reconocible</b> (sureste), <b>sin logotipos</b>, <b>español bien escrito</b> (cuando lo pide), <b>proporción</b> (ya recortada como la vería el creator) y, en las ediciones, <b>fidelidad</b>. Las columnas están barajadas por fila: no busques patrón. Clic en una imagen para verla grande.</p>
<main id="app"></main>
<dialog id="zoom"><img alt=""></dialog>
<script>
const D=${JSON.stringify(datos).replace(/</g, "\\u003c")};
const esc=(t)=>String(t).replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const KEY="bakeoff-"+D.runId;
let estado={};try{estado=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
const guardar=()=>{try{localStorage.setItem(KEY,JSON.stringify(estado))}catch(e){}};
function barajar(a,semilla){let s=semilla;const r=()=>(s=(s*9301+49297)%233280)/233280;return a.map(x=>[r(),x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);}
const app=document.getElementById("app");
D.prompts.forEach((p,i)=>{
  const sec=document.createElement("section");
  sec.innerHTML="<h2>"+esc(p.id)+" · "+esc(p.aspect)+(p.editOf?" · edita "+esc(p.editOf):"")+"</h2><p class=desc>"+esc(p.description)+"</p><p class=mirar>Mirar: "+esc(p.mirar)+"</p>";
  const fila=document.createElement("div");fila.className="fila";
  barajar(D.models,(i+1)*7919).forEach((m,j)=>{
    const k=p.id+"|"+m;const letra=String.fromCharCode(65+j);
    const piezas=D.piezas.filter(x=>x.promptId===p.id&&x.model===m);
    const c=document.createElement("div");c.className="celda";
    const imgs=piezas.map(x=>x.status==="ok"?'<img loading=lazy src="'+esc(x.file)+'" alt="'+letra+' v'+x.variant+'">':'<div class=falla>'+esc(x.status)+(x.nota?": "+esc(x.nota):"")+'</div>').join("");
    const meta=piezas.filter(x=>x.status==="ok").map(x=>x.original+(x.final!==x.original?" → "+x.final:"")+" · "+x.segundos.toFixed(1)+" s · "+(x.costUsd==null?"sin precio":"$"+x.costUsd.toFixed(3))).join(" | ");
    c.innerHTML="<h3>"+letra+' <span class=modelo>· '+esc(m)+"</span></h3><div class=imgs>"+(imgs||'<div class=falla>sin imagen</div>')+"</div><div class=meta>"+meta+"</div>";
    const sc=document.createElement("div");sc.className="score";
    for(let n=1;n<=5;n++){const b=document.createElement("button");b.textContent=n;if(estado[k]?.score===n)b.className="on";b.onclick=()=>{estado[k]={...estado[k],score:n};guardar();[...sc.children].forEach(x=>x.className="");b.className="on";};sc.appendChild(b);}
    const t=document.createElement("textarea");t.placeholder="Nota (opcional)";t.value=estado[k]?.nota||"";t.oninput=()=>{estado[k]={...estado[k],nota:t.value};guardar();};
    c.append(sc,t);fila.appendChild(c);
  });
  sec.appendChild(fila);app.appendChild(sec);
});
document.getElementById("revelar").onclick=e=>{document.body.classList.toggle("revelado");e.target.classList.toggle("on");};
document.getElementById("copiar").onclick=async()=>{
  const scores=Object.entries(estado).map(([k,v])=>{const[promptId,model]=k.split("|");return{promptId,model,score:v.score??null,nota:v.nota??""}});
  const txt=JSON.stringify({runId:D.runId,scores},null,1);
  try{await navigator.clipboard.writeText(txt);document.getElementById("estado").textContent="Copiado: "+scores.length+" calificaciones";}
  catch(e){prompt("Copia esto:",txt);}
};
const zoom=document.getElementById("zoom");
app.addEventListener("click",e=>{if(e.target.tagName==="IMG"){zoom.querySelector("img").src=e.target.src;zoom.showModal();}});
zoom.addEventListener("click",()=>zoom.close());
</script></body></html>`;
}

function reporte(
  fecha: string,
  runId: string,
  prompts: BakeoffPrompt[],
  models: string[],
  piezas: Pieza[],
) {
  const fila = (x: Pieza) =>
    `| ${x.model} | ${x.promptId} | v${String(x.variant)} | ${x.segundos !== undefined ? `${x.segundos.toFixed(1)} s` : "—"} | ${x.original ?? "—"}${x.final && x.final !== x.original ? ` → ${x.final}` : ""} | ${x.costUsd === undefined ? "—" : x.costUsd === null ? "sin precio" : `$${x.costUsd.toFixed(4)}`} | ${x.status === "ok" ? "" : `**${x.status}**${x.nota ? `: ${x.nota}` : ""}`} |`;
  const resumen = models.map((m) => {
    const de = piezas.filter((x) => x.model === m);
    const ok = de.filter((x) => x.status === "ok");
    const total = ok.reduce((s, x) => s + (x.costUsd ?? 0), 0);
    const lat = ok.map((x) => x.segundos ?? 0).sort((a, b) => a - b);
    const mediana = lat.length > 0 ? lat[Math.floor(lat.length / 2)]! : null;
    return `| ${m} | ${String(ok.length)}/${String(de.length)} | ${String(de.filter((x) => x.status === "bloqueada").length)} | ${String(de.filter((x) => x.status === "error").length)} | ${mediana === null ? "—" : `${mediana.toFixed(1)} s`} | ${total.toFixed(3)} | ${ok.length > 0 ? `${(total / ok.length).toFixed(4)}` : "—"} |`;
  });
  return [
    `# Bake-off de generadores de imagen — ${fecha}`,
    "",
    `Corrida \`${runId}\`, generada por \`apps/api/scripts/image-bakeoff/run.ts\` (ADR-025, F10.7) con el adapter y el prompt compuesto de producción. Galería a ciegas y originales en \`apps/api/scripts/image-bakeoff/out/${runId}/\` (no versionados). Medidas: original → recortada a la proporción de la card (image-fit).`,
    "",
    "## Resumen por modelo",
    "",
    "| Modelo | Imágenes | Bloqueadas | Errores | Latencia mediana | Costo total | Costo por imagen |",
    "|---|---|---|---|---|---|---|",
    ...resumen,
    "",
    "## Calificaciones (juicio humano)",
    "",
    "_Pendiente: se llena con el JSON de la galería._",
    "",
    "## Detalle",
    "",
    "| Modelo | Prompt | Variante | Latencia | Medidas | Costo | Notas |",
    "|---|---|---|---|---|---|---|",
    ...piezas.map(fila),
    "",
    "## Prompts",
    "",
    ...prompts.map(
      (p) =>
        `- **${p.id}** (${p.aspectRatio}${p.editOf ? `, edita ${p.editOf}` : ""}${p.raw ? ", sin componer" : ""}): ${p.description}`,
    ),
    "",
  ].join("\n");
}

async function main() {
  const models = (process.env.IMAGE_BAKEOFF_MODELS?.split(",") ?? DEFAULT_MODELS).map((m) =>
    m.trim(),
  );
  const only = process.env.IMAGE_BAKEOFF_PROMPTS?.split(",").map((p) => p.trim());
  const variants = Number(process.env.IMAGE_BAKEOFF_VARIANTS ?? 2) || 2;
  // Una edición necesita su base: pedir solo "marquesitas-calida" corre
  // también "marquesitas", o la edición no tendría qué editar.
  const bases = PROMPTS.filter((p) => only?.includes(p.id) && p.editOf).map((p) => p.editOf);
  // Y al revés: re-correr una base re-corre sus ediciones.
  const prompts = only
    ? PROMPTS.filter(
        (p) => only.includes(p.id) || bases.includes(p.id) || only.includes(p.editOf ?? ""),
      )
    : PROMPTS;

  // Falla antes de gastar: un modelo sin key truena aquí, no a la mitad.
  const resolve = createImageModelResolver(process.env);
  for (const m of models) resolve(m);

  const fecha = new Date().toISOString().slice(0, 10);
  const hora = new Date().toISOString().slice(11, 16).replace(":", "");
  const runId = `${fecha}-${hora}`;
  const runDir = path.join(OUT_ROOT, runId);
  await mkdir(path.join(runDir, "originales"), { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  // Un modelo por carril, en paralelo: el bake-off completo son ~120
  // imágenes, y en fila serían más de media hora.
  const piezas = (
    await Promise.all(models.map((m) => correrModelo(m, prompts, variants, runDir, fecha)))
  ).flat();

  await writeFile(path.join(runDir, "index.html"), galeria(runId, prompts, models, piezas));
  // Nunca pisa un reporte: el de una corrida completa es la evidencia que cita
  // ADR-025, y una re-corrida parcial del mismo día lo reemplazaría.
  const parcial = only ? "-parcial" : "";
  const reportFile = path.join(REPORT_DIR, `${runId}-reporte${parcial}.md`);
  await writeFile(reportFile, reporte(fecha, runId, prompts, models, piezas), { flag: "wx" });
  console.log(`\nGalería: ${path.join(runDir, "index.html")}\nReporte: ${reportFile}`);
  // Para que el reporte se pueda releer sin rehacer la galería.
  await writeFile(path.join(runDir, "piezas.json"), JSON.stringify(piezas, null, 1));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
