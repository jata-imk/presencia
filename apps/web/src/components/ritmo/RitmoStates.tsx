import type { ReactNode } from "react";
import { CloudOff, Clock, Sprout, WifiOff } from "lucide-react";
import {
  DIAS_SEMANA,
  FRANJAS,
  macroRegionLabel,
  verticalLabel,
  type TrendsDto,
} from "@presencia/shared";
import { Button } from "../ui/Button.js";

// Los estados vacíos del módulo.
//
// Son la parte del producto donde más fácil se miente, porque el momento de
// tentación es justo cuando no hay datos. La regla, escrita en el doc de
// producto: se dice por qué está vacío y qué falta para que deje de estarlo —
// nunca se rellena con humo para que se vea lleno.

function Vacio({
  icono,
  titulo,
  children,
  accion,
}: {
  icono: ReactNode;
  titulo: string;
  children: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary">
        {icono}
      </div>
      <p className="font-display text-base font-bold text-fg">{titulo}</p>
      <p className="max-w-[380px] text-[13px] leading-relaxed text-fg-secondary">{children}</p>
      {accion}
    </div>
  );
}

/** El heatmap de cadencia sin una sola publicación. */
export function CadenciaVacia() {
  return (
    <Vacio
      icono={<Sprout size={22} className="text-fg-muted" />}
      titulo="Aquí va a crecer tu constancia"
    >
      Cada día que publiques pinta una celda. Tu primer post enciende el mapa.
    </Vacio>
  );
}

/**
 * La red publicó pero no reporta números.
 *
 * No es "todavía no tienes datos": es un límite de la plataforma, y decirle
 * al usuario que siga publicando para desbloquearlo sería prometerle algo que
 * nunca va a llegar.
 */
export function HorariosNoReporta({ red }: { red: string }) {
  return (
    <Vacio
      icono={<Clock size={22} className="text-fg-muted" />}
      titulo="Esta red no reporta horarios"
    >
      {red} no comparte estadísticas de engagement por franja, así que no podemos calcular tus
      mejores horarios ahí. No es algo que se desbloquee publicando más.
    </Vacio>
  );
}

/** Hay publicaciones pero todavía no alcanzan para un "+%" honesto. */
export function HorariosPocaData({ n }: { n: number }) {
  return (
    <Vacio
      icono={<Clock size={22} className="text-fg-muted" />}
      titulo="Todavía no alcanza para tus horarios"
    >
      Llevas {n} {n === 1 ? "publicación medida" : "publicaciones medidas"} en esta red. Con unas
      cuantas más podemos decirte a qué horas te escuchan mejor, sin inventarte un número.
    </Vacio>
  );
}

/** Ni una publicación medida en esa red. */
export function HorariosSinData() {
  return (
    <Vacio icono={<Clock size={22} className="text-fg-muted" />} titulo="Aún no hay nada que medir">
      Cuando publiques en esta red vamos a ir aprendiendo a qué horas te funciona mejor.
    </Vacio>
  );
}

/** Tendencias: nunca buscadas, o buscadas sin resultado. */
export function TendenciasVacias({ datos }: { datos: TrendsDto }) {
  const nicho = verticalLabel(datos.vertical);
  const region = macroRegionLabel(datos.region);
  // `generatedAt` en null distingue "todavía no buscamos" de "buscamos y no
  // encontramos". Son dos cosas distintas y el usuario merece saber cuál es.
  // Sin botón propio: el de la cabecera de la sección es el que busca, y en
  // estos tres casos no cobra.
  if (datos.refresco.enCurso) {
    return (
      <Vacio
        icono={<CloudOff size={22} className="text-fg-muted" />}
        titulo="Buscando tus tendencias"
      >
        {`Estamos revisando qué se mueve en ${nicho} por el ${region}. Tarda cerca de un minuto y aparecen acá solas.`}
      </Vacio>
    );
  }
  const nuncaBuscado = datos.generatedAt === null;
  return (
    <Vacio
      icono={<CloudOff size={22} className="text-fg-muted" />}
      titulo={
        nuncaBuscado ? "Todavía no buscamos tus tendencias" : "No encontramos tendencias frescas"
      }
    >
      {nuncaBuscado
        ? `Las traemos solas en menos de un día. Si no quieres esperar, búscalas ahora: la primera vez no cuesta.`
        : `No hay nada fresco de ${nicho} en el ${region} ahorita. No te inventamos tendencias para llenar el espacio; volver a buscar no cuesta.`}
    </Vacio>
  );
}

/** El módulo no pudo cargar. */
export function RitmoError({
  mensaje,
  onReintentar,
}: {
  mensaje: string;
  onReintentar: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-xl border border-error-border bg-error-bg px-4 py-3"
    >
      <WifiOff size={16} className="shrink-0 text-error" />
      <span className="flex-1 text-[13px] text-error">{mensaje}</span>
      <Button variant="secondary" onClick={onReintentar}>
        Reintentar
      </Button>
    </div>
  );
}

/**
 * El esqueleto de la pantalla mientras carga el resumen.
 *
 * Reproduce la ESTRUCTURA, no un rectángulo por bloque: las celdas miden los
 * mismos 22px que el heatmap real y las filas de metas el mismo alto que una
 * `FilaObjetivo`. La diferencia no es estética — un esqueleto más corto que su
 * contenido hace que la pantalla salte cuando llegan los datos, que es
 * exactamente lo que un esqueleto existe para evitar.
 *
 * Incluye el bloque de narración aunque no siempre exista: se oculta solo
 * cuando el usuario no tiene ninguna publicación, y cuando eso pasa el resto
 * de la pantalla también está vacío.
 *
 * Las tendencias NO están acá: llegan por su propia petición, después y al
 * final de la página, así que su hueco no desplaza nada de lo que ya se ve.
 */
export function RitmoSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden>
      {/* Cabecera: título, subtítulo y el "vas N/M" de la semana. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Barra alto="h-[43px]" ancho="w-[190px]" />
          <Barra alto="h-[23px]" ancho="w-[340px]" />
        </div>
        <Barra alto="h-[19px]" ancho="w-[250px]" />
      </div>

      {/* Narración: cabecera con botón a la derecha y dos líneas de texto. */}
      <BloqueVacio>
        {/* Sin `mb-5`: el bloque de narración no usa `TituloBloque`, su
            cabecera va pegada al texto. Con el margen sobraban 9px que
            empujaban hacia abajo todo lo que viene después. */}
        <CabeceraDeBloque
          anchoTitulo="w-[190px]"
          margen=""
          derecha={<Barra alto="h-9" ancho="w-[133px]" />}
        />
        <div className="mt-3 flex flex-col gap-[3px]">
          <Barra alto="h-[18px]" ancho="w-full max-w-[560px]" />
          <Barra alto="h-[18px]" ancho="w-[430px]" />
        </div>
      </BloqueVacio>

      {/* Cadencia: 16 columnas de 7 celdas, el mismo tamaño que el mapa real. */}
      <BloqueVacio>
        <CabeceraDeBloque
          anchoTitulo="w-[240px]"
          conSubtitulo
          derecha={<Barra alto="h-9" ancho="w-[160px]" redondeo="rounded-full" />}
        />
        <div className="pb-1">
          <div className="inline-flex flex-col gap-1">
            <div className="flex gap-1 pl-9">
              {Array.from({ length: SEMANAS_VISIBLES }).map((_, columna) => (
                <div key={columna} className="h-[15px] w-[22px]" />
              ))}
            </div>
            <div className="flex gap-1">
              <div className="w-8 shrink-0" />
              {Array.from({ length: SEMANAS_VISIBLES }).map((_, columna) => (
                <div key={columna} className="flex flex-col gap-1">
                  {Array.from({ length: 7 }).map((__, fila) => (
                    <div key={fila} className="h-[22px] w-[22px] rounded-[5px] bg-secondary" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <Barra alto="h-[34px]" ancho="w-[210px]" redondeo="rounded-full" />
          <Barra alto="h-[18px]" ancho="w-[150px]" />
        </div>
      </BloqueVacio>

      {/* Metas: tres filas, el alto real de una FilaObjetivo con su borde.
          Tres y no cuatro porque el número real depende de cuántas redes tenga
          conectadas el usuario, que es justo lo que todavía no se sabe. Es el
          único bloque que puede no calzar, y queda entero debajo del pliegue. */}
      <BloqueVacio>
        <CabeceraDeBloque anchoTitulo="w-[260px]" conSubtitulo />
        {Array.from({ length: 3 }).map((_, fila) => (
          <div
            key={fila}
            className="flex items-center gap-3 border-b border-line-subtle py-3 last:border-b-0"
          >
            <Barra alto="h-[33px]" ancho="w-[150px]" />
            <Barra alto="h-[10px]" ancho="w-[120px]" redondeo="rounded-full" />
            <Barra alto="h-[18px]" ancho="w-[110px]" />
            <Barra alto="h-8" ancho="ml-auto w-[100px]" />
          </div>
        ))}
      </BloqueVacio>

      {/* Horarios: el mismo hueco que usa la pantalla al cambiar de red. */}
      <BloqueVacio>
        <CabeceraDeBloque
          anchoTitulo="w-[200px]"
          conSubtitulo
          derecha={<Barra alto="h-9" ancho="w-[290px]" redondeo="rounded-full" />}
        />
        <HorariosSkeleton />
      </BloqueVacio>
    </div>
  );
}

/** Las mismas 16 semanas que manda el servidor (SEMANAS_CADENCIA). */
const SEMANAS_VISIBLES = 16;

/**
 * El hueco del heatmap de horarios, con su forma real.
 *
 * Reemplaza un rectángulo de 320px que se quedó corto: el mapa mide 378 —ocho
 * franjas de 36px, su cabecera de días y el pie que explica contra qué se
 * compara— así que al llegar los datos la sección crecía 58px y empujaba las
 * tendencias hacia abajo. Se pinta también al cambiar de pestaña de red, que
 * es cuando más se nota.
 *
 * Las medidas salen de HorariosHeatmap, no de una constante aparte: mismas
 * `w-[78px]`, mismo `h-9`, mismo `gap-1`.
 */
export function HorariosSkeleton() {
  return (
    <div className="overflow-x-auto" aria-hidden>
      <div className="inline-flex animate-pulse flex-col gap-1">
        <div className="flex gap-1">
          <div className="w-[76px] shrink-0" />
          {DIAS_SEMANA.map((dia) => (
            <div key={dia} className="flex h-5 w-[78px] shrink-0 items-center justify-center">
              <div className="h-3 w-7 rounded bg-secondary" />
            </div>
          ))}
        </div>
        {FRANJAS.map((franja) => (
          <div key={franja.id} className="flex gap-1">
            <div className="flex w-[76px] shrink-0 flex-col items-end justify-center gap-1 pr-2">
              <div className="h-3 w-10 rounded bg-secondary" />
              <div className="h-2 w-14 rounded bg-secondary" />
            </div>
            {DIAS_SEMANA.map((dia) => (
              <div
                key={`${franja.id}-${dia}`}
                className="h-9 w-[78px] shrink-0 rounded-lg bg-secondary"
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-4 h-[22px] w-full max-w-[620px] animate-pulse rounded bg-secondary" />
    </div>
  );
}

function Barra({
  alto,
  ancho,
  redondeo = "rounded-lg",
}: {
  alto: string;
  ancho: string;
  redondeo?: string;
}) {
  return <div className={`${alto} ${ancho} ${redondeo} bg-secondary`} />;
}

/** La misma caja que `Bloque`, sin importarlo: este archivo no compone pantalla. */
function BloqueVacio({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-line bg-card p-6">{children}</div>;
}

/** Kicker + título (+ subtítulo), con el mismo `mb-5` que `TituloBloque`. */
function CabeceraDeBloque({
  anchoTitulo,
  conSubtitulo = false,
  derecha,
  margen = "mb-5",
}: {
  anchoTitulo: string;
  conSubtitulo?: boolean;
  derecha?: ReactNode;
  /** `TituloBloque` trae `mb-5`; la cabecera de la narración, no. */
  margen?: string;
}) {
  return (
    <div className={`${margen} flex items-start justify-between gap-3`}>
      <div className="flex flex-col">
        <div className="flex h-[17px] items-center">
          <Barra alto="h-[11px]" ancho="w-[150px]" />
        </div>
        <div className="flex h-[28px] items-center">
          <Barra alto="h-[20px]" ancho={anchoTitulo} />
        </div>
        {conSubtitulo && (
          <div className="mt-1 flex h-[20px] items-center">
            <Barra alto="h-[14px]" ancho="w-[330px]" />
          </div>
        )}
      </div>
      {derecha}
    </div>
  );
}
