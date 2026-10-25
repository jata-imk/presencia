// Bake-off de búsqueda web (F10.10, ADR-028).
//
// Corre las mismas consultas —las que haría el chat por un creator del
// sureste— contra cada API de búsqueda candidata y, como referencia, contra la
// búsqueda nativa de cada modelo de la cadena, y deja:
//   - una galería a ciegas para calificar (out/<corrida>/index.html): por
//     consulta, una columna por candidato, barajadas (A, B, C…), con los cinco
//     resultados que vería el modelo (título, dominio, fragmento, fecha);
//   - un reporte markdown con latencia, costo, % de dominios .mx, largo del
//     fragmento y cuántos resultados traen fecha.
// El juicio de calidad es humano: se califica en la galería y se pega el JSON.
//
// Uso: pnpm --filter @presencia/api bakeoff:busqueda
// SEARCH_BAKEOFF_CANDIDATES="brave,serper" corre solo esos (ids de candidatos.ts).
// SEARCH_BAKEOFF_QUERIES="id1,id2" corre solo esas consultas (ids de consultas.ts).
// SEARCH_BAKEOFF_FRESH=1 ignora el caché del día (cache.ts) y busca todo de nuevo.
//
// Cuesta dinero de verdad, poco: 16 consultas × 7 candidatos ≈ $0.80 (lo caro
// son las nativas). Las APIs tienen tier gratis que lo cubre. La galería no se
// versiona (out/ está en .gitignore); el reporte de una corrida completa sí,
// en docs/reference/bakeoff-busqueda/ (el de una parcial queda en out/).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CANDIDATOS, type Candidato, type Resultado } from "./candidatos.js";
import { cacheKey, OUT_ROOT, readCached, writeCached } from "./cache.js";
import { CONSULTAS, type Consulta } from "./consultas.js";

// pnpm --filter corre el script con apps/api como cwd.
const REPORT_DIR = path.resolve("../../docs/reference/bakeoff-busqueda");

// Los tiers gratis limitan a ~1 consulta por segundo (Brave): en fila, con
// una pausa, por candidato. Los candidatos sí van en paralelo entre sí.
const PAUSA_MS = 1_100;

interface Pieza {
  consultaId: string;
  candidato: string;
  status: "ok" | "error";
  resultados: Resultado[];
  respuesta?: string;
  busquedas?: number;
  segundos?: number;
  costUsd?: number | null;
  nota?: string;
  /** Fecha (ISO) en que se buscó, si salió del caché: no se pagó en esta corrida. */
  reusada?: string;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function correrCandidato(
  c: Candidato,
  consultas: Consulta[],
  fecha: string,
  fresh: boolean,
): Promise<Pieza[]> {
  const piezas: Pieza[] = [];
  for (const q of consultas) {
    const etiqueta = `[${c.id}] ${q.id}`;
    const key = cacheKey(c.id, q.consulta, fecha);
    const cached = fresh ? null : await readCached(key);
    if (cached) {
      piezas.push({
        consultaId: q.id,
        candidato: c.id,
        status: "ok",
        resultados: cached.resultados,
        respuesta: cached.respuesta,
        busquedas: cached.busquedas,
        segundos: cached.segundos,
        costUsd: cached.costUsd,
        reusada: cached.buscadaEn,
      });
      console.log(`${etiqueta}: del caché`);
      continue;
    }
    const arranque = Date.now();
    try {
      const busqueda = await c.buscar(q.consulta);
      const segundos = (Date.now() - arranque) / 1000;
      piezas.push({ consultaId: q.id, candidato: c.id, status: "ok", ...busqueda, segundos });
      console.log(
        `${etiqueta}: ${String(busqueda.resultados.length)} resultados, ${segundos.toFixed(1)} s`,
      );
      // Fuera de la llamada: la búsqueda ya se pagó, y un disco lleno no debe
      // convertirla en "error".
      try {
        await writeCached(key, {
          ...busqueda,
          candidato: c.id,
          consultaId: q.id,
          buscadaEn: new Date().toISOString(),
          segundos,
        });
      } catch (error) {
        console.warn(`${etiqueta}: no se guardó en el caché (${String(error)})`);
      }
    } catch (error) {
      // En una sola línea: va en una fila de tabla del reporte.
      const nota = (error instanceof Error ? error.message : String(error))
        .replace(/\|/g, "/")
        .replace(/\s+/g, " ")
        .slice(0, 200);
      piezas.push({
        consultaId: q.id,
        candidato: c.id,
        status: "error",
        resultados: [],
        segundos: (Date.now() - arranque) / 1000,
        nota,
      });
      console.error(`${etiqueta}: error ${nota}`);
    }
    if (c.clase === "api") await espera(PAUSA_MS);
  }
  return piezas;
}

function mediana(ordenados: number[]): number | null {
  const n = ordenados.length;
  if (n === 0) return null;
  const mitad = Math.floor(n / 2);
  return n % 2 === 1 ? ordenados[mitad]! : (ordenados[mitad - 1]! + ordenados[mitad]!) / 2;
}

/** El día en Mérida (YYYY-MM-DD), no en UTC: a las 18:00 de aquí, en UTC ya es mañana. */
function hoyEnMerida(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Merida" }).format(ahora);
}

/** Un dominio mexicano: .mx, o .com.mx/.org.mx/.gob.mx, que también terminan en .mx. */
const esMx = (dominio: string) => dominio.endsWith(".mx");

function metricas(piezas: Pieza[]) {
  const ok = piezas.filter((p) => p.status === "ok");
  const resultados = ok.flatMap((p) => p.resultados);
  const nuevas = ok.filter((p) => !p.reusada);
  const lat = (nuevas.length > 0 ? nuevas : ok).map((p) => p.segundos ?? 0).sort((a, b) => a - b);
  const costo = ok.reduce((s, p) => s + (p.costUsd ?? 0), 0);
  const conFragmento = resultados.filter((r) => r.fragmento.length > 0);
  return {
    ok: ok.length,
    errores: piezas.length - ok.length,
    latencia: mediana(lat),
    latenciaDelCache: nuevas.length === 0 && ok.length > 0,
    costo,
    porMil: ok.length > 0 ? (costo / ok.length) * 1000 : null,
    resultadosPorConsulta: ok.length > 0 ? resultados.length / ok.length : 0,
    pctMx:
      resultados.length > 0
        ? resultados.filter((r) => esMx(r.dominio)).length / resultados.length
        : 0,
    fragmento:
      conFragmento.length > 0
        ? conFragmento.reduce((s, r) => s + r.fragmento.length, 0) / conFragmento.length
        : 0,
    pctFecha:
      resultados.length > 0 ? resultados.filter((r) => r.fecha).length / resultados.length : 0,
    // Solo dice algo en las nativas: 0 = contestó sin buscar.
    sinBuscar: ok.filter((p) => p.busquedas === 0).length,
  };
}

function galeria(runId: string, consultas: Consulta[], piezas: Pieza[]): string {
  const datos = { runId, consultas, piezas };
  // Página local, fuera del producto: estilos en línea, sin tokens ni build.
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bake-off de búsqueda ${runId}</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#f6f3f7;color:#2b1f30}
header{position:sticky;top:0;background:#fff;border-bottom:1px solid #ddd;padding:12px 20px;z-index:2;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
header h1{font-size:18px;margin:0 12px 0 0}
button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #aaa;background:#fff;cursor:pointer}
button.on{background:#3d2347;color:#fff;border-color:#3d2347}
.criterios{font-size:13px;color:#555;padding:8px 20px;max-width:1100px}
section{padding:16px 20px;border-bottom:1px solid #e3dbe7}
section h2{font-size:16px;margin:0 0 4px}
.mirar{font-size:13px;color:#7a3b8f;margin:0 0 12px}
.fila{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.celda{background:#fff;border-radius:12px;padding:10px}
.celda h3{margin:0 0 8px;font-size:15px}
.respuesta{font-size:13px;background:#f3eef5;border-radius:8px;padding:8px;margin:0 0 8px}
ol{margin:0;padding-left:20px}li{margin:0 0 8px;font-size:13px}
li a{color:#3d2347;font-weight:600;word-break:break-word}
.dom{color:#2a7a4b;font-size:12px}.fecha{color:#777;font-size:12px}
.frag{color:#444;margin-top:2px}
.falla{font-size:12px;color:#b00;padding:12px 0}
.meta{display:none;font-size:11px;color:#333;margin-top:6px}.revelado .meta{display:block}
.modelo{display:none;font-size:12px;color:#3d2347;font-weight:600}.revelado .modelo{display:inline}
.score{display:flex;gap:4px;margin-top:8px}.score button{padding:4px 10px}
textarea{width:100%;box-sizing:border-box;margin-top:6px;font:inherit;font-size:13px;min-height:38px}
</style></head><body>
<header><h1>Bake-off de búsqueda · ${runId}</h1>
<button id="revelar">Revelar candidatos</button>
<button id="copiar">Copiar resultados</button><span id="estado" style="font-size:13px;color:#555"></span></header>
<p class="criterios">Califica cada columna de 1 a 5 como lo que tendría el modelo para contestarle al creator: <b>relevancia</b> (¿contesta la consulta?), <b>frescura</b> (¿es de este año, de esta semana?), <b>local</b> (¿fuentes de Yucatán y de México?) y <b>fragmento útil</b> (¿el modelo podría contestar sin abrir la página?). Las columnas con una respuesta arriba y sin fragmentos son búsquedas nativas de un modelo: están de referencia, no son opción. Columnas barajadas por consulta; no busques patrón. Latencia y costo aparecen al revelar.</p>
<main id="app"></main>
<script>
const D=${JSON.stringify(datos).replace(/</g, "\\u003c")};
const esc=(t)=>String(t??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const seguro=(u)=>/^https?:\\/\\//i.test(u)?u:"#";
const KEY="bakeoff-busqueda-"+D.runId;
let estado={};try{estado=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
const guardar=()=>{try{localStorage.setItem(KEY,JSON.stringify(estado))}catch(e){}};
function barajar(a,semilla){let s=semilla;const r=()=>(s=(s*9301+49297)%233280)/233280;return a.map(x=>[r(),x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);}
const app=document.getElementById("app");
D.consultas.forEach((q,i)=>{
  const columnas=D.piezas.filter(x=>x.consultaId===q.id);
  if(columnas.length===0)return;
  const sec=document.createElement("section");
  sec.innerHTML="<h2>"+esc(q.consulta)+" <span style='font-weight:400;color:#777'>· "+esc(q.grupo)+"</span></h2><p class=mirar>Mirar: "+esc(q.mirar)+"</p>";
  const fila=document.createElement("div");fila.className="fila";
  barajar(columnas,(i+1)*7919).forEach((x,j)=>{
    const k=q.id+"|"+x.candidato;const letra=String.fromCharCode(65+j);
    const c=document.createElement("div");c.className="celda";
    // A ciegas, un error solo dice que no hubo resultados: el texto del
    // servicio delataría al candidato. El detalle, al revelar.
    let cuerpo=x.respuesta?"<p class=respuesta>"+esc(x.respuesta)+"</p>":"";
    if(x.status!=="ok")cuerpo+="<div class=falla>No trajo resultados</div>";
    else if(x.resultados.length===0)cuerpo+="<div class=falla>Cero resultados</div>";
    else cuerpo+="<ol>"+x.resultados.map(r=>"<li><a href='"+esc(seguro(r.url))+"' target=_blank rel=noopener>"+esc(r.titulo)+"</a> <span class=dom>"+esc(r.dominio)+"</span>"+(r.fecha?" <span class=fecha>· "+esc(r.fecha)+"</span>":"")+(r.fragmento?"<div class=frag>"+esc(r.fragmento)+"</div>":"")+"</li>").join("")+"</ol>";
    const meta=(x.segundos!=null?x.segundos.toFixed(1)+" s · ":"")+(x.costUsd==null?"sin precio":"$"+x.costUsd.toFixed(4))+(x.busquedas!=null?" · "+x.busquedas+" búsqueda(s)":"")+(x.reusada?" · del "+x.reusada.slice(0,10):"")+(x.nota?" · "+esc(x.nota):"");
    c.innerHTML="<h3>"+letra+" <span class=modelo>· "+esc(x.candidato)+"</span></h3>"+cuerpo+"<div class=meta>"+meta+"</div>";
    const sc=document.createElement("div");sc.className="score";
    for(let n=1;n<=5;n++){const b=document.createElement("button");b.textContent=n;if(estado[k]?.score===n)b.className="on";b.onclick=()=>{estado[k]={...estado[k],score:n};guardar();[...sc.children].forEach(x=>x.className="");b.className="on";};sc.appendChild(b);}
    const t=document.createElement("textarea");t.placeholder="Nota (opcional)";t.value=estado[k]?.nota||"";t.oninput=()=>{estado[k]={...estado[k],nota:t.value};guardar();};
    c.append(sc,t);fila.appendChild(c);
  });
  sec.appendChild(fila);app.appendChild(sec);
});
document.getElementById("revelar").onclick=e=>{document.body.classList.toggle("revelado");e.target.classList.toggle("on");};
document.getElementById("copiar").onclick=async()=>{
  const scores=Object.entries(estado).map(([k,v])=>{const[consultaId,candidato]=k.split("|");return{consultaId,candidato,score:v.score??null,nota:v.nota??""}});
  const txt=JSON.stringify({runId:D.runId,scores},null,1);
  try{await navigator.clipboard.writeText(txt);document.getElementById("estado").textContent="Copiado: "+scores.length+" calificaciones";}
  catch(e){prompt("Copia esto:",txt);}
};
</script></body></html>`;
}

function reporte(
  fecha: string,
  runId: string,
  consultas: Consulta[],
  candidatos: Candidato[],
  piezas: Pieza[],
) {
  const pct = (n: number) => `${Math.round(n * 100)} %`;
  const resumen = candidatos.map((c) => {
    const m = metricas(piezas.filter((p) => p.candidato === c.id));
    const latencia =
      m.latencia === null
        ? "—"
        : `${m.latencia.toFixed(1)} s${m.latenciaDelCache ? " (del caché)" : ""}`;
    return `| ${c.id} | ${c.clase} | ${String(m.ok)}/${String(m.ok + m.errores)} | ${latencia} | ${m.porMil === null ? "—" : `$${m.porMil.toFixed(2)}`} | ${c.precio} | ${m.resultadosPorConsulta.toFixed(1)} | ${pct(m.pctMx)} | ${m.fragmento > 0 ? `${Math.round(m.fragmento)} chars` : "—"} | ${pct(m.pctFecha)} | ${c.clase === "nativa" ? String(m.sinBuscar) : "—"} |`;
  });
  const detalle = piezas.map(
    (p) =>
      `| ${p.candidato} | ${p.consultaId} | ${p.status === "ok" ? String(p.resultados.length) : `**error**: ${p.nota ?? ""}`} | ${p.segundos !== undefined ? `${p.segundos.toFixed(1)} s` : "—"} | ${p.costUsd == null ? "—" : `$${p.costUsd.toFixed(4)}`} | ${p.resultados.map((r) => r.dominio).join(", ") || "—"} |`,
  );
  const total = piezas.reduce((s, p) => s + (p.reusada ? 0 : (p.costUsd ?? 0)), 0);
  return [
    `# Bake-off de búsqueda web — ${fecha}`,
    "",
    `Corrida \`${runId}\`, generada por \`apps/api/scripts/search-bakeoff/run.ts\` (F10.10, ADR-028). Galería a ciegas en \`apps/api/scripts/search-bakeoff/out/${runId}/\` (no versionada). Pagado en esta corrida: $${total.toFixed(3)}.`,
    "",
    "Las **nativas** (búsqueda propia de cada modelo de la cadena) están de referencia de calidad, no son opción: se pierden en el respaldo de la cadena y cambian de forma con cada modelo (ADR-028). Sus fuentes no traen fragmento; la galería muestra su respuesta.",
    "",
    "## Resumen por candidato",
    "",
    "| Candidato | Clase | Consultas ok | Latencia mediana | USD/1k (medido) | Precio de lista | Resultados/consulta | Dominios .mx | Fragmento promedio | Con fecha | Nativa sin buscar |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...resumen,
    "",
    "## Calificaciones (juicio humano)",
    "",
    "_Pendiente: se llena con el JSON de la galería._",
    "",
    "## Detalle",
    "",
    "| Candidato | Consulta | Resultados | Latencia | Costo | Dominios |",
    "|---|---|---|---|---|---|",
    ...detalle,
    "",
    "## Consultas",
    "",
    ...consultas.map((q) => `- **${q.id}** (${q.grupo}): "${q.consulta}". Mirar: ${q.mirar}`),
    "",
  ].join("\n");
}

async function main() {
  const soloCandidatos = process.env.SEARCH_BAKEOFF_CANDIDATES?.split(",").map((c) => c.trim());
  const soloConsultas = process.env.SEARCH_BAKEOFF_QUERIES?.split(",").map((q) => q.trim());
  const fresh = process.env.SEARCH_BAKEOFF_FRESH === "1";

  // Falla antes de gastar: un id mal escrito dejaría la galería sin él.
  for (const id of soloCandidatos ?? []) {
    if (!CANDIDATOS.some((c) => c.id === id)) {
      throw new Error(
        `Candidato "${id}" no existe. Hay: ${CANDIDATOS.map((c) => c.id).join(", ")}.`,
      );
    }
  }
  for (const id of soloConsultas ?? []) {
    if (!CONSULTAS.some((q) => q.id === id)) throw new Error(`Consulta "${id}" no existe.`);
  }
  const candidatos = soloCandidatos
    ? CANDIDATOS.filter((c) => soloCandidatos.includes(c.id))
    : CANDIDATOS;
  const consultas = soloConsultas
    ? CONSULTAS.filter((q) => soloConsultas.includes(q.id))
    : CONSULTAS;
  // Y sin keys: un candidato sin key truena aquí, no a la mitad.
  const faltan = candidatos.flatMap((c) =>
    c.requiere.filter((k) => !process.env[k]).map((k) => `${c.id} (${k})`),
  );
  if (faltan.length > 0) {
    throw new Error(
      `Faltan keys en el .env: ${faltan.join(", ")}. Agrégalas o deja fuera esos candidatos con SEARCH_BAKEOFF_CANDIDATES.`,
    );
  }

  const ahora = new Date();
  const fecha = hoyEnMerida(ahora);
  const hora = ahora.toISOString().slice(11, 19).replaceAll(":", "");
  const runId = `${fecha}-${hora}`;
  const runDir = path.join(OUT_ROOT, runId);
  await mkdir(runDir, { recursive: true });

  const piezas = (
    await Promise.all(candidatos.map((c) => correrCandidato(c, consultas, fecha, fresh)))
  ).flat();

  await writeFile(path.join(runDir, "index.html"), galeria(runId, consultas, piezas));
  // Solo una corrida completa deja reporte versionado: es la evidencia que
  // cita ADR-028, y nunca se pisa. Una parcial (probar un candidato, repetir
  // una consulta) lo deja junto a su galería, fuera de git.
  const parcial = Boolean(soloCandidatos ?? soloConsultas);
  if (!parcial) await mkdir(REPORT_DIR, { recursive: true });
  const reportFile = parcial
    ? path.join(runDir, "reporte-parcial.md")
    : path.join(REPORT_DIR, `${runId}-reporte.md`);
  await writeFile(reportFile, reporte(fecha, runId, consultas, candidatos, piezas), { flag: "wx" });
  await writeFile(path.join(runDir, "piezas.json"), JSON.stringify(piezas, null, 1));
  console.log(`\nGalería: ${path.join(runDir, "index.html")}\nReporte: ${reportFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
