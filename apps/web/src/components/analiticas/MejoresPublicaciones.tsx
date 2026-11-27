import { useState, type ReactNode } from "react";
import { AlignLeft, Film, Image as ImageIcon, Images, Trophy, type LucideIcon } from "lucide-react";
import {
  NETWORK_LABELS,
  assetContentUrl,
  type AnaliticasPublicacionDto,
  type PeriodoAnaliticas,
} from "@presencia/shared";
import { NETWORK_META } from "../cards/NetworkLogos.js";
import { fechaCorta, numero, textoLift } from "../../lib/analiticas/formato.js";
import { EncabezadoSeccion, VacioSeccion } from "./Seccion.js";

// "Tus mejores publicaciones" (lore doc §3): hasta cinco, las que más
// rindieron SOBRE TU PROMEDIO EN SU RED. El motor ya las eligió y ordenó
// (`mejores`, regla 12 del addendum F12 de ADR-022); aquí solo se pintan.
//
// Tres formas, por el ancho de la columna:
// - @4xl: la rejilla del diseño, la #1 más ancha (1.45fr) y más alta. Con
//   menos de cinco, las columnas que sobran quedan vacías: la #1 no se estira
//   a todo el ancho, se lee igual tenga una o cinco compañeras;
// - @lg: dos columnas, con la #1 a todo el ancho;
// - móvil: tarjetas horizontales, miniatura y texto.
//
// Cada tarjeta es un botón que abre el detalle (`?post=`).

const SIN_MUESTRA =
  "Con unas publicaciones más te diremos cuáles rindieron por encima de tu promedio.";
const SIN_POSITIVOS = "En este periodo ninguna publicación superó tu promedio.";

export function MejoresPublicaciones({
  publicaciones,
  mejores,
  periodo,
  timeZone,
  onAbrir,
}: {
  /** Las filas del periodo (ya filtradas por red), de donde salen los datos. */
  publicaciones: AnaliticasPublicacionDto[];
  /** Los `cardId` elegidos por el motor, en orden. */
  mejores: string[];
  periodo: PeriodoAnaliticas;
  timeZone: string;
  onAbrir: (cardId: string) => void;
}) {
  const porId = new Map(publicaciones.map((p) => [p.cardId, p]));
  const elegidas = mejores
    .map((id) => porId.get(id))
    .filter((p): p is AnaliticasPublicacionDto => p !== undefined);
  // Vacío no dice por qué (contrato de la API): si alguna fila tiene "sobre
  // tu promedio", hubo con qué comparar y ninguna lo superó.
  const hayLifts = publicaciones.some((p) => p.lift !== null);

  return (
    <SeccionMejores periodo={periodo}>
      {elegidas.length === 0 ? (
        <VacioSeccion icono={Trophy} texto={hayLifts ? SIN_POSITIVOS : SIN_MUESTRA} />
      ) : (
        <ol className="grid grid-cols-1 gap-2.5 @lg:grid-cols-2 @lg:gap-3.5 @4xl:grid-cols-[minmax(0,1.45fr)_repeat(4,minmax(0,1fr))] @4xl:items-start">
          {elegidas.map((publicacion, i) => (
            <li
              key={publicacion.cardId}
              className={i === 0 ? "@lg:col-span-2 @4xl:col-span-1" : ""}
            >
              <Tarjeta
                publicacion={publicacion}
                lugar={i + 1}
                timeZone={timeZone}
                onAbrir={onAbrir}
              />
            </li>
          ))}
        </ol>
      )}
    </SeccionMejores>
  );
}

/** El marco de la sección, también para su esqueleto y su error. */
export function SeccionMejores({
  periodo,
  children,
}: {
  periodo: PeriodoAnaliticas;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby="mejores-titulo" className="flex flex-col gap-3.5">
      <EncabezadoSeccion
        id="mejores-titulo"
        titulo="Tus mejores publicaciones"
        subtitulo={`Las que más rindieron sobre tu promedio en su red · últimos ${String(periodo)} días`}
      />
      {children}
    </section>
  );
}

/** Cinco tarjetas con su forma mientras llega `/publicaciones`. */
export function MejoresSkeleton({ periodo }: { periodo: PeriodoAnaliticas }) {
  return (
    <SeccionMejores periodo={periodo}>
      <div
        aria-hidden
        className="grid animate-pulse grid-cols-1 gap-2.5 @lg:grid-cols-2 @lg:gap-3.5 @4xl:grid-cols-[minmax(0,1.45fr)_repeat(4,minmax(0,1fr))] @4xl:items-start"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-card p-2.5 @lg:flex-col @lg:items-stretch @lg:gap-0 @lg:p-0 ${
              i === 0 ? "@lg:col-span-2 @4xl:col-span-1" : i > 2 ? "hidden @4xl:flex" : ""
            }`}
          >
            <div
              className={`size-[72px] shrink-0 rounded-lg bg-secondary @lg:w-full @lg:rounded-none ${
                i === 0 ? "@lg:h-[220px] @4xl:h-[300px]" : "@lg:h-[180px] @4xl:h-[216px]"
              }`}
            />
            <div className="flex flex-1 flex-col gap-2 @lg:p-3.5">
              <div className="h-6 w-16 rounded-md bg-secondary" />
              <div className="h-3 w-full max-w-[160px] rounded-md bg-secondary" />
            </div>
          </div>
        ))}
      </div>
    </SeccionMejores>
  );
}

function iconoDeFormato(publicacion: AnaliticasPublicacionDto): LucideIcon {
  if (publicacion.archetype === "video_script") return Film;
  if (publicacion.miniatura.imagenes > 1) return Images;
  return publicacion.archetype === "visual_first" ? ImageIcon : AlignLeft;
}

function Tarjeta({
  publicacion,
  lugar,
  timeZone,
  onAbrir,
}: {
  publicacion: AnaliticasPublicacionDto;
  lugar: number;
  timeZone: string;
  onAbrir: (cardId: string) => void;
}) {
  const primera = lugar === 1;
  const meta = NETWORK_META[publicacion.network];
  const red = NETWORK_LABELS[publicacion.network];
  const lift = textoLift(publicacion.lift ?? 0).texto;
  const titulo = publicacion.titulo || "Publicación sin texto";
  const assetId = publicacion.miniatura.assetId;
  // Una imagen que ya no está en Biblioteca cae al ícono del formato, igual
  // que en el Calendario y en la tabla (lore doc §3).
  const [falloImagen, setFalloImagen] = useState<string | null>(null);
  const conImagen = assetId !== null && falloImagen !== assetId;
  const Icono = iconoDeFormato(publicacion);

  const fecha = fechaCorta(new Date(publicacion.publishedAt), timeZone);
  const metricas = [
    publicacion.alcance === null ? null : `${numero(publicacion.alcance)} alcance`,
    publicacion.interacciones === null
      ? null
      : `${numero(publicacion.interacciones)} interacciones`,
  ].filter((t): t is string => t !== null);

  return (
    <button
      type="button"
      data-card-id={publicacion.cardId}
      onClick={() => onAbrir(publicacion.cardId)}
      aria-label={`${String(lugar)}. ${titulo}: ${lift} sobre tu promedio en ${red}`}
      className="group flex w-full items-center gap-3 overflow-hidden rounded-xl border border-line bg-card p-2.5 text-left shadow-sm transition-shadow outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-line-focus @lg:flex-col @lg:items-stretch @lg:gap-0 @lg:border-0 @lg:p-0 @lg:shadow-md"
    >
      {/* La portada */}
      <span
        style={conImagen ? undefined : { background: "var(--ana-portada-bg)" }}
        className={`relative flex size-[72px] shrink-0 items-end overflow-hidden rounded-lg @lg:w-full @lg:rounded-none ${
          primera ? "@lg:h-[220px] @4xl:h-[300px]" : "@lg:h-[180px] @4xl:h-[216px]"
        }`}
      >
        {conImagen ? (
          <img
            src={assetContentUrl(assetId)}
            alt=""
            loading="lazy"
            onError={() => setFalloImagen(assetId)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <>
            <span className="absolute inset-0 flex items-center justify-center text-brand opacity-35">
              <Icono
                strokeWidth={1.5}
                className={`size-7 ${primera ? "@lg:size-[46px]" : "@lg:size-[34px]"}`}
                aria-hidden
              />
            </span>
            {/* Sin portada, el título va en ella y abajo no se repite. */}
            <span
              className={`relative hidden font-display leading-[1.3] font-semibold text-pretty text-fg @lg:line-clamp-3 ${
                primera ? "p-4 text-[17px]" : "p-[13px] text-sm"
              }`}
            >
              {titulo}
            </span>
          </>
        )}
        <span
          aria-hidden
          className={`absolute flex items-center justify-center rounded-full font-display font-bold ${
            primera
              ? "top-1.5 left-1.5 size-6 bg-primary text-xs text-primary-fg @lg:top-3 @lg:left-3 @lg:size-[30px] @lg:text-sm"
              : "top-1.5 left-1.5 size-6 bg-card text-xs text-brand @lg:top-[11px] @lg:left-[11px] @lg:size-[26px] @lg:text-[13px]"
          }`}
        >
          {lugar}
        </span>
        <span
          aria-hidden
          className="absolute top-3 right-3 hidden size-[26px] items-center justify-center rounded-[7px] bg-card shadow-xs @lg:flex"
        >
          <meta.Logo size={14} />
        </span>
      </span>

      {/* El texto */}
      <span
        className={`flex min-w-0 flex-1 flex-col @lg:p-3.5 ${
          primera ? "@lg:p-4 @4xl:flex-row @4xl:items-end @4xl:justify-between @4xl:gap-2.5" : ""
        }`}
      >
        <span className="flex min-w-0 flex-col">
          {conImagen && (
            <span className="mb-1.5 hidden font-display text-sm leading-snug font-semibold text-fg @lg:line-clamp-2">
              {titulo}
            </span>
          )}
          <span className="truncate font-display text-sm font-medium text-fg @lg:hidden">
            {titulo}
          </span>
          <span
            className={`font-display leading-none font-semibold tracking-[-0.02em] text-brand ${
              primera
                ? "mt-1 text-xl @lg:mt-0 @lg:text-[32px]"
                : "mt-1 text-xl @lg:mt-0 @lg:text-[26px]"
            }`}
          >
            {lift}
          </span>
          <span className="mt-1 flex items-center gap-1 text-xs text-fg-secondary @lg:mt-[5px]">
            <span className="@lg:hidden">
              <meta.Logo size={12} />
            </span>
            sobre tu promedio en {red}
          </span>
        </span>
        <span
          className={`mt-1 text-[11px] text-fg-muted @lg:mt-[5px] ${
            primera ? "@4xl:mt-0 @4xl:shrink-0 @4xl:text-right @4xl:text-xs" : ""
          }`}
        >
          {primera ? (
            <>
              <span className="@4xl:hidden">{[fecha, ...metricas].join(" · ")}</span>
              <span className="hidden @4xl:inline">
                {fecha}
                {metricas.map((m) => (
                  <span key={m} className="block">
                    {m}
                  </span>
                ))}
              </span>
            </>
          ) : (
            [fecha, ...metricas].join(" · ")
          )}
        </span>
      </span>
    </button>
  );
}
