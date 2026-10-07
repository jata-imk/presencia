// Bake-off de generadores de imagen (F10, ADR-025; ampliado en F10.7).
//
// Corre los mismos prompts —escritos como los escribiría el chat para un
// creator del sureste— contra cada modelo, con el MISMO adapter y el MISMO
// prompt compuesto de producción (AiSdkImageProvider + composeImagePrompt), y
// deja:
//   - una galería a ciegas para calificar (out/<corrida>/index.html): por
//     prompt, una columna por imagen, barajadas (A, B, C…), ya recortadas a
//     la proporción que vería el creator, que recibe una por clic;
//   - un reporte markdown con latencia, medidas, costo y bloqueos por imagen.
// El juicio de calidad es humano: se califica en la galería y se pega el JSON.
//
// Uso: pnpm --filter @presencia/api bakeoff:imagenes
// IMAGE_BAKEOFF_MODELS="google:x,openai:y" cambia los modelos.
// IMAGE_BAKEOFF_PROMPTS="id1,id2" re-corre solo esos prompts.
// IMAGE_BAKEOFF_VARIANTS=1 genera una imagen por prompt en todos los modelos.
// IMAGE_BAKEOFF_GALLERY_VARIANTS=2 califica solo esas variantes en la galería.
// IMAGE_BAKEOFF_FRESH=1 ignora el caché (cache.ts) y paga todo de nuevo.
//
// Cuesta dinero de verdad, pero una imagen ya generada con el mismo modelo y
// el mismo prompt sale del caché sin pagarse otra vez. La corrida de F10.7
// sin caché: ~$3.30 (dos variantes para los candidatos, una para los dos
// conocidos). Las imágenes NO se versionan: caen en
// scripts/image-bakeoff/out/ (en .gitignore). El reporte sí, en
// docs/reference/bakeoff-imagenes/.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { costOf } from "../../src/ai/model-prices.js";
import { createImageModelResolver } from "../../src/ai/provider-registry.js";
import { AiSdkImageProvider } from "../../src/images/ai-sdk-image.provider.js";
import { fitToAspect } from "../../src/images/image-fit.js";
import type { ImageRequest } from "../../src/images/image-provider.js";
import { OUT_ROOT, cacheKey, readCached, writeCached } from "./cache.js";
import { PROMPTS, promptFor, type BakeoffPrompt } from "./prompts.js";
import { registrarGasto, splitModelId } from "../gasto-local.js";

// Los candidatos de F10.7 (docs/reference/modelos-de-imagen-2026-09.md):
// Grok Imagine 2.0 (principal propuesto), Muse y MAI-Image por OpenRouter,
// Nano Banana 2 (el de hoy, control) y gpt-image-2 (el alternativo de hoy).
// Los dos conocidos van con una variante: están de referencia, ya se sabe
// cómo dibujan, y Nano Banana 2 es el más caro de todos (~$0.095 en 4:5).
const DEFAULT_MODELS: { id: string; variants: number }[] = [
  { id: "xai:grok-imagine-image-2.0", variants: 2 },
  { id: "openrouter:meta/muse-image", variants: 2 },
  { id: "openrouter:microsoft/mai-image-2.6", variants: 2 },
  { id: "google:gemini-3.1-flash-image", variants: 1 },
  { id: "openai:gpt-image-2", variants: 1 },
];

// pnpm --filter corre el script con apps/api como cwd.
const REPORT_DIR = path.resolve("../../docs/reference/bakeoff-imagenes");

function extension(mediaType: string) {
  return mediaType.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
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
  /** Fecha (ISO) en que se generó, si salió del caché: no se pagó en esta corrida. */
  reusada?: string;
}

async function medidas(data: Uint8Array): Promise<string> {
  const { width, height } = await sharp(data).metadata();
  return `${String(width ?? "?")}×${String(height ?? "?")}`;
}

/** El costo que cobró el proveedor si lo reporta (OpenRouter), si no la tabla de precios. */
function costo(
  model: string,
  raw: unknown,
  input: number,
  output: number,
  images: number,
): number | null {
  const reportado = (raw as { providerMetadata?: { openrouter?: { cost?: number | null } } })
    ?.providerMetadata?.openrouter?.cost;
  if (typeof reportado === "number") return reportado;
  return costOf({
    ...splitModelId(model),
    inputTokens: input,
    outputTokens: output,
    imagesCount: images,
  });
}

/** Lo que salió de una imagen, recién pagada o del caché. */
type Salida =
  | { status: "ok"; data: Uint8Array; mediaType: string; segundos: number; costUsd: number | null }
  | { status: "bloqueada"; segundos: number; costUsd: number | null };

async function correrModelo(
  modelId: string,
  prompts: BakeoffPrompt[],
  variants: number,
  runDir: string,
  fecha: string,
  fresh: boolean,
): Promise<Pieza[]> {
  const resolve = createImageModelResolver(process.env);
  const provider = new AiSdkImageProvider(resolve(modelId), modelId);
  const slug = modelId.replace(/[:/]/g, "_");
  const piezas: Pieza[] = [];
  // La primera variante que salió de cada prompt, YA recortada: en producción
  // se edita el asset guardado, que image-fit ya llevó a la proporción.
  const bases = new Map<string, { data: Uint8Array; mediaType: string; key: string }>();

  for (const p of prompts) {
    const cuantas = p.editOf ? 1 : variants;
    for (let variant = 1; variant <= cuantas; variant++) {
      const request: ImageRequest = { prompt: promptFor(p), aspectRatio: p.aspectRatio };
      const base = p.editOf ? bases.get(p.editOf) : undefined;
      if (p.editOf) {
        if (!base) {
          piezas.push({ promptId: p.id, model: modelId, variant, status: "sin base" });
          continue;
        }
        request.reference = { data: base.data, mediaType: base.mediaType };
      }
      const key = cacheKey({
        model: modelId,
        prompt: request.prompt,
        aspectRatio: p.aspectRatio,
        variant,
        baseKey: base?.key,
      });
      const etiqueta = `[${modelId}] ${p.id} v${String(variant)}`;

      let salida: Salida | null = null;
      let reusada: string | undefined;
      const cached = fresh ? null : await readCached(key);
      if (cached?.meta.status === "bloqueada") {
        salida = { ...cached.meta, status: "bloqueada" };
      } else if (cached?.data && cached.meta.mediaType) {
        salida = {
          ...cached.meta,
          status: "ok",
          data: cached.data,
          mediaType: cached.meta.mediaType,
        };
      }
      // Una ficha "ok" sin imagen o sin tipo (sembrada a mano, a medio
      // escribir) no es un bloqueo: se genera de nuevo, como si no estuviera.
      if (salida) {
        reusada = cached!.meta.generatedAt;
      } else {
        const arranque = Date.now();
        try {
          const result = await provider.generate(request);
          const segundos = (Date.now() - arranque) / 1000;
          const input = result.usage?.inputTokens ?? 0;
          const output = result.usage?.outputTokens ?? 0;
          const images = result.kind === "blocked" ? 0 : 1;
          if (result.usage) {
            await registrarGasto({
              script: "bakeoff",
              ...splitModelId(modelId),
              task: request.reference ? "image_edit" : "image_generate",
              inputTokens: input,
              outputTokens: output,
              imagesCount: images,
            });
          }
          const costUsd = costo(modelId, result.providerRaw, input, output, images);
          salida =
            result.kind === "blocked"
              ? { status: "bloqueada", segundos, costUsd }
              : { status: "ok", data: result.data, mediaType: result.mediaType, segundos, costUsd };
        } catch (error) {
          const nota =
            error instanceof Error
              ? error.message.replace(/\|/g, "/").slice(0, 200)
              : String(error);
          piezas.push({
            promptId: p.id,
            model: modelId,
            variant,
            status: "error",
            segundos: (Date.now() - arranque) / 1000,
            nota,
          });
          console.error(`${etiqueta}: error ${nota}`);
          continue;
        }
        // Fuera del try de la llamada: la imagen ya se pagó, y un disco lleno
        // o un archivo bloqueado no deben convertirla en "error" y tirarla.
        try {
          await writeCached(
            key,
            {
              model: modelId,
              promptId: p.id,
              variant,
              status: salida.status,
              mediaType: salida.status === "ok" ? salida.mediaType : undefined,
              generatedAt: new Date().toISOString(),
              segundos: salida.segundos,
              costUsd: salida.costUsd,
            },
            salida.status === "ok" ? salida.data : null,
          );
        } catch (error) {
          console.warn(
            `${etiqueta}: no se guardó en el caché (${String(error)}); se volvería a pagar`,
          );
        }
      }

      const origen = reusada ? `del caché (${reusada.slice(0, 10)})` : "";
      if (salida.status === "bloqueada") {
        piezas.push({
          promptId: p.id,
          model: modelId,
          variant,
          status: "bloqueada",
          segundos: salida.segundos,
          costUsd: salida.costUsd,
          reusada,
        });
        console.log(`${etiqueta}: bloqueada ${origen}`);
        continue;
      }
      // Lo que vería el creator: recortada a la proporción de la card,
      // como hace image-fit.ts al guardarla.
      const final = await fitToAspect(salida.data, p.aspectRatio);
      // La huella de la base para sus ediciones: la suya MÁS el contenido de la
      // imagen (los bytes originales, no los del recorte, que dependen de la
      // versión de sharp). Con IMAGE_BAKEOFF_FRESH la base se regenera bajo la
      // misma huella; sin el contenido, la edición vieja saldría del caché
      // junto a una base que no es la suya.
      if (!bases.has(p.id)) {
        const contenido = createHash("sha256").update(salida.data).digest("hex").slice(0, 16);
        bases.set(p.id, { data: final, mediaType: salida.mediaType, key: `${key}:${contenido}` });
      }
      const file = `${p.id}__${slug}__v${String(variant)}.${extension(salida.mediaType)}`;
      await writeFile(path.join(runDir, file), final);
      await writeFile(path.join(runDir, "originales", `${fecha}_${file}`), salida.data);
      piezas.push({
        promptId: p.id,
        model: modelId,
        variant,
        status: "ok",
        file,
        original: await medidas(salida.data),
        final: await medidas(final),
        segundos: salida.segundos,
        costUsd: salida.costUsd,
        reusada,
      });
      console.log(`${etiqueta}: ok ${origen || `${salida.segundos.toFixed(1)} s`}`);
    }
  }
  return piezas;
}

function galeria(
  runId: string,
  prompts: BakeoffPrompt[],
  piezas: Pieza[],
  variantes: number[] | null,
): string {
  const datos = {
    runId,
    variantes,
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
.imgs{display:flex;gap:6px}.imgs img{flex:1 1 0;min-width:0;height:auto;border-radius:6px;cursor:zoom-in;background:#eee}
.falla{font-size:12px;color:#b00;padding:20px 0}
.meta{display:none;font-size:11px;color:#777;margin-top:6px}.revelado .meta{display:block}
.score{display:flex;gap:4px;margin-top:8px}.score button{padding:4px 10px}
textarea{width:100%;box-sizing:border-box;margin-top:6px;font:inherit;font-size:13px;min-height:38px}
.modelo{display:none;font-size:12px;color:#3d2347;font-weight:600}.revelado .modelo{display:inline}
.revelado .meta{color:#333}
dialog{border:0;padding:0;background:transparent}dialog img{max-width:92vw;max-height:92vh}
</style></head><body>
<header><h1>Bake-off de imágenes · ${runId}</h1>
<button id="revelar">Revelar modelos</button>
<button id="copiar">Copiar resultados</button><span id="estado" style="font-size:13px;color:#555"></span></header>
<p class="criterios">Califica cada imagen de 1 a 5, sola, como la vería el creator (una por clic): <b>lugar reconocible</b> (sureste), <b>sin logotipos</b>, <b>español bien escrito</b> (cuando lo pide), <b>proporción</b> (ya recortada como la vería el creator) y, en las ediciones, <b>fidelidad</b>. Cada columna es una imagen, barajadas por fila: dos columnas pueden ser del mismo modelo, y no busques patrón. Las medidas y el costo aparecen al revelar: delatarían al modelo. Clic en una imagen para verla grande.${
    variantes ? ` Solo se muestran las variantes ${variantes.join(", ")}.` : ""
  }</p>
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
  // Una columna por imagen: con una imagen por clic, eso es lo que ve el creator.
  const columnas=D.piezas.filter(x=>x.promptId===p.id&&(!D.variantes||D.variantes.includes(x.variant)));
  if(columnas.length===0)return;
  barajar(columnas,(i+1)*7919).forEach((x,j)=>{
    const m=x.model;const k=p.id+"|"+m+"|"+x.variant;const letra=String.fromCharCode(65+j);
    const c=document.createElement("div");c.className="celda";
    // A ciegas, una falla solo dice que no hubo imagen: el texto del proveedor
    // (DallEBlockList, el de xAI…) delataría al modelo. El detalle, al revelar.
    const img=x.status==="ok"?'<img loading=lazy src="'+esc(x.file)+'" alt="'+letra+'">':'<div class=falla>No generó imagen</div>';
    const meta=x.status==="ok"?x.original+(x.final!==x.original?" → "+x.final:"")+" · "+x.segundos.toFixed(1)+" s · "+(x.costUsd==null?"sin precio":"$"+x.costUsd.toFixed(3))+(x.reusada?" · del "+x.reusada.slice(0,10):""):esc(x.status)+(x.nota?": "+esc(x.nota):"");
    c.innerHTML="<h3>"+letra+' <span class=modelo>· '+esc(m)+" v"+x.variant+"</span></h3><div class=imgs>"+img+"</div><div class=meta>"+meta+"</div>";
    const sc=document.createElement("div");sc.className="score";
    for(let n=1;n<=5;n++){const b=document.createElement("button");b.textContent=n;if(estado[k]?.score===n)b.className="on";b.onclick=()=>{estado[k]={...estado[k],score:n};guardar();[...sc.children].forEach(x=>x.className="");b.className="on";};sc.appendChild(b);}
    const t=document.createElement("textarea");t.placeholder="Nota (opcional)";t.value=estado[k]?.nota||"";t.oninput=()=>{estado[k]={...estado[k],nota:t.value};guardar();};
    c.append(sc,t);fila.appendChild(c);
  });
  sec.appendChild(fila);app.appendChild(sec);
});
document.getElementById("revelar").onclick=e=>{document.body.classList.toggle("revelado");e.target.classList.toggle("on");};
document.getElementById("copiar").onclick=async()=>{
  const scores=Object.entries(estado).map(([k,v])=>{const[promptId,model,variant]=k.split("|");return{promptId,model,variant:Number(variant),score:v.score??null,nota:v.nota??""}});
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
    `| ${x.model} | ${x.promptId} | v${String(x.variant)} | ${x.segundos !== undefined ? `${x.segundos.toFixed(1)} s` : "—"} | ${x.original ?? "—"}${x.final && x.final !== x.original ? ` → ${x.final}` : ""} | ${x.costUsd === undefined ? "—" : x.costUsd === null ? "sin precio" : `$${x.costUsd.toFixed(4)}`} | ${[x.status === "ok" ? "" : `**${x.status}**${x.nota ? `: ${x.nota}` : ""}`, x.reusada ? `del caché (${x.reusada.slice(0, 10)})` : ""].filter(Boolean).join(" · ")} |`;
  const resumen = models.map((m) => {
    const de = piezas.filter((x) => x.model === m);
    const ok = de.filter((x) => x.status === "ok");
    // Un bloqueo también cuesta (Gemini cobra la entrada).
    const total = de.reduce((s, x) => s + (x.costUsd ?? 0), 0);
    const pagado = de.filter((x) => !x.reusada).reduce((s, x) => s + (x.costUsd ?? 0), 0);
    // La latencia de lo generado en esta corrida; la del caché es de otro día
    // y otra carga del proveedor, y solo se usa si no hay nada más.
    const nuevas = ok.filter((x) => !x.reusada);
    const base = nuevas.length > 0 ? nuevas : ok;
    const lat = base.map((x) => x.segundos ?? 0).sort((a, b) => a - b);
    const mediana = lat.length > 0 ? lat[Math.floor(lat.length / 2)]! : null;
    const latencia =
      mediana === null
        ? "—"
        : `${mediana.toFixed(1)} s${nuevas.length === 0 ? " (del caché)" : ""}`;
    return `| ${m} | ${String(ok.length)}/${String(de.length)} | ${String(de.filter((x) => x.status === "bloqueada").length)} | ${String(de.filter((x) => x.status === "error").length)} | ${latencia} | $${total.toFixed(3)} | $${pagado.toFixed(3)} | ${ok.length > 0 ? `$${(total / ok.length).toFixed(4)}` : "—"} |`;
  });
  return [
    `# Bake-off de generadores de imagen — ${fecha}`,
    "",
    `Corrida \`${runId}\`, generada por \`apps/api/scripts/image-bakeoff/run.ts\` (ADR-025, F10.7) con el adapter y el prompt compuesto de producción. Galería a ciegas y originales en \`apps/api/scripts/image-bakeoff/out/${runId}/\` (no versionados). Medidas: original → recortada a la proporción de la card (image-fit).`,
    "",
    "## Resumen por modelo",
    "",
    "| Modelo | Imágenes | Bloqueadas | Errores | Latencia mediana | Costo de las imágenes | Pagado en esta corrida | Costo por imagen |",
    "|---|---|---|---|---|---|---|---|",
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
  // IMAGE_BAKEOFF_VARIANTS, si viene, manda sobre todos los modelos; si no,
  // los de IMAGE_BAKEOFF_MODELS van con dos y los de default con las suyas.
  const envVariants = Number(process.env.IMAGE_BAKEOFF_VARIANTS) || undefined;
  const runs = (
    process.env.IMAGE_BAKEOFF_MODELS?.split(",").map((m) => ({ id: m.trim(), variants: 2 })) ??
    DEFAULT_MODELS
  ).map((r) => ({ ...r, variants: envVariants ?? r.variants }));
  const models = runs.map((r) => r.id);
  // Qué variantes entran a la galería (default: todas). Para calificar solo
  // las nuevas de una segunda ronda sin repetir las ya calificadas: "2".
  const variantes =
    process.env.IMAGE_BAKEOFF_GALLERY_VARIANTS?.split(",").map((v) => Number(v.trim())) ?? null;
  // Falla antes de gastar: un valor mal escrito ("v2") dejaría la galería
  // vacía después de pagar la corrida.
  if (variantes?.some((v) => !Number.isInteger(v) || v < 1)) {
    throw new Error(
      `IMAGE_BAKEOFF_GALLERY_VARIANTS="${process.env.IMAGE_BAKEOFF_GALLERY_VARIANTS ?? ""}" no es una lista de números (p. ej. "2" o "1,2").`,
    );
  }
  const fresh = process.env.IMAGE_BAKEOFF_FRESH === "1";
  const only = process.env.IMAGE_BAKEOFF_PROMPTS?.split(",").map((p) => p.trim());
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
  // Con segundos: dos corridas en el mismo minuto (p. ej. dos parciales seguidas)
  // chocaban en la carpeta y en el reporte, que se escribe sin pisar.
  const hora = new Date().toISOString().slice(11, 19).replaceAll(":", "");
  const runId = `${fecha}-${hora}`;
  const runDir = path.join(OUT_ROOT, runId);
  await mkdir(path.join(runDir, "originales"), { recursive: true });
  await mkdir(REPORT_DIR, { recursive: true });

  // Un modelo por carril, en paralelo: el bake-off completo son ~120
  // imágenes, y en fila serían más de media hora.
  const piezas = (
    await Promise.all(
      runs.map((r) => correrModelo(r.id, prompts, r.variants, runDir, fecha, fresh)),
    )
  ).flat();

  await writeFile(path.join(runDir, "index.html"), galeria(runId, prompts, piezas, variantes));
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
