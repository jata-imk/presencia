import type { ReactNode } from "react";
import { CloudOff, Clock, Sprout, WifiOff } from "lucide-react";
import { macroRegionLabel, verticalLabel, type TrendsDto } from "@presencia/shared";
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
export function TendenciasVacias({
  datos,
  onReintentar,
}: {
  datos: TrendsDto;
  onReintentar: () => void;
}) {
  const nicho = verticalLabel(datos.vertical);
  const region = macroRegionLabel(datos.region);
  // `generatedAt` en null distingue "todavía no buscamos" de "buscamos y no
  // encontramos". Son dos cosas distintas y el usuario merece saber cuál es.
  const nuncaBuscado = datos.generatedAt === null;
  return (
    <Vacio
      icono={<CloudOff size={22} className="text-fg-muted" />}
      titulo={
        nuncaBuscado ? "Estamos buscando tus tendencias" : "No encontramos tendencias frescas"
      }
      accion={
        nuncaBuscado ? undefined : (
          <Button variant="secondary" onClick={onReintentar}>
            Volver a revisar
          </Button>
        )
      }
    >
      {nuncaBuscado
        ? `Salimos a buscar qué se está moviendo en ${nicho} por el ${region}. En un momento aparecen acá.`
        : `No hay nada fresco de ${nicho} en el ${region} ahorita. No te inventamos tendencias para llenar el espacio.`}
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

/** Skeletons que respetan la estructura, nunca un spinner genérico. */
export function RitmoSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-3">
        <div className="h-7 w-52 rounded-lg bg-secondary" />
        <div className="h-4 w-80 rounded-lg bg-secondary" />
      </div>
      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="h-5 w-48 rounded-lg bg-secondary" />
        <div className="mt-5 flex gap-[3px]">
          {Array.from({ length: 16 }).map((_, columna) => (
            <div key={columna} className="flex flex-col gap-[3px]">
              {Array.from({ length: 7 }).map((__, fila) => (
                <div key={fila} className="h-[14px] w-[14px] rounded-[3px] bg-secondary" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-card p-6">
        <div className="h-5 w-56 rounded-lg bg-secondary" />
        <div className="mt-4 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, fila) => (
            <div key={fila} className="h-9 w-full rounded-lg bg-secondary" />
          ))}
        </div>
      </div>
    </div>
  );
}
