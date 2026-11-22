import { useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { socialNetworkSchema, type PeriodoAnaliticas, type SocialNetwork } from "@presencia/shared";
import { BarraControl } from "../components/analiticas/BarraControl.js";
import { LentePorPublicacion } from "../components/analiticas/LentePorPublicacion.js";
import { LentePorRed } from "../components/analiticas/LentePorRed.js";
import { ResumenKpis } from "../components/analiticas/ResumenKpis.js";
import {
  AnaliticasError,
  AnaliticasSkeleton,
  CeroAbsoluto,
  LenteSkeleton,
} from "../components/analiticas/AnaliticasStates.js";
import { useTimezone } from "../lib/calendar/use-timezone.js";
import {
  useAnaliticasPublicaciones,
  useAnaliticasRedes,
  useAnaliticasResumen,
} from "../lib/analiticas/use-analiticas.js";

// La pantalla de Analíticas (F12, `presencia-analiticas.md`): compone, no
// calcula. Todos los números salen del motor (addendum F12 de ADR-022); el
// copy de los estados, de lib/analiticas/formato.ts.
//
// Una vista y no tabs por sección (lore doc §7): arriba lo que se lee de un
// vistazo, abajo las lentes para escarbar. Las lentes sí son tabs: muestran
// lo mismo cortado distinto. "Por concepto", "Tus mejores publicaciones" y
// "Hallazgos" llegan con el PR 8.
//
// Periodo, red y lente viven en la URL: al volver del chat de origen con
// "atrás", la pantalla queda como estaba.
//
// Maneja su propio alto (`handle.ownScroll`) y tiene dos `@container`, como
// Biblioteca: la raíz, contra la que se acomoda el panel de detalle, y la
// columna, contra la que se acomoda todo lo demás.

type Lente = "red" | "publicacion";

const LENTES: { id: Lente; texto: string }[] = [
  { id: "red", texto: "Por red" },
  { id: "publicacion", texto: "Por publicación" },
];

function periodoDe(valor: string | null): PeriodoAnaliticas {
  return valor === "7" ? 7 : valor === "90" ? 90 : 30;
}

function redDe(valor: string | null): SocialNetwork | null {
  const parsed = socialNetworkSchema.safeParse(valor);
  return parsed.success ? parsed.data : null;
}

export function AnaliticasPage() {
  const timeZone = useTimezone();
  const [params, setParams] = useSearchParams();
  const periodo = periodoDe(params.get("periodo"));
  const red = redDe(params.get("red"));
  const lente: Lente = params.get("lente") === "publicacion" ? "publicacion" : "red";

  // `replace`: cambiar el periodo no es navegar; "atrás" tiene que sacarte
  // de Analíticas, no recorrer cada filtro que probaste.
  function cambiar(clave: string, valor: string | null) {
    setParams(
      (actual) => {
        const siguiente = new URLSearchParams(actual);
        if (valor === null) siguiente.delete(clave);
        else siguiente.set(clave, valor);
        return siguiente;
      },
      { replace: true },
    );
  }

  const resumen = useAnaliticasResumen(periodo, red);
  const redes = useAnaliticasRedes(periodo);
  const publicaciones = useAnaliticasPublicaciones(periodo, red);

  // Un solo "ahora" por respuesta: la tendencia y los "hace…" de la tabla se
  // etiquetan contra el mismo instante.
  const ahora = useMemo(() => new Date(), [resumen.datos]);

  const redesConPublicaciones = useMemo(
    () => redes.datos?.redes.map((r) => r.network) ?? [],
    [redes.datos],
  );
  // La API manda siempre todas; con una red elegida, la lente muestra la suya.
  const redesVisibles = useMemo(
    () => (redes.datos?.redes ?? []).filter((r) => red === null || r.network === red),
    [redes.datos, red],
  );

  // "y N redes más": la lente Por red suele ser ya la activa, así que cambiar
  // de lente solo no movía nada y el botón parecía roto. Se lleva al usuario
  // hasta ella.
  const lentes = useRef<HTMLElement>(null);
  function verPorRed() {
    cambiar("lente", null);
    lentes.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    lentes.current?.querySelector<HTMLElement>("#lente-panel")?.focus({ preventScroll: true });
  }

  function reintentarTodo() {
    resumen.reintentar();
    redes.reintentar();
    publicaciones.reintentar();
  }

  return (
    <div className="@container relative flex h-full bg-surface">
      <div className="@container relative flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-7 px-4 pt-5 pb-16 @lg:px-6 @4xl:gap-8 @4xl:px-8 @4xl:pt-7">
            <BarraControl
              periodo={periodo}
              onPeriodo={(p) => cambiar("periodo", p === 30 ? null : String(p))}
              red={red}
              onRed={(r) => cambiar("red", r)}
              redes={redesConPublicaciones}
              ultimaMedicion={resumen.datos?.ultimaMedicion ?? null}
              ahora={ahora}
            />

            {resumen.error ? (
              <AnaliticasError onReintentar={reintentarTodo} />
            ) : !resumen.datos ? (
              <AnaliticasSkeleton />
            ) : !resumen.datos.hayPublicaciones ? (
              <CeroAbsoluto />
            ) : (
              <>
                <ResumenKpis resumen={resumen.datos} onVerPorRed={verPorRed} />

                <section
                  ref={lentes}
                  className="flex scroll-mt-4 flex-col gap-4"
                  aria-label="Lentes"
                >
                  <div
                    role="tablist"
                    aria-label="Lente"
                    className="inline-flex gap-0.5 self-start rounded-full border border-line bg-card p-[3px]"
                  >
                    {LENTES.map(({ id, texto }) => {
                      const activa = id === lente;
                      return (
                        <button
                          key={id}
                          id={`lente-${id}`}
                          type="button"
                          role="tab"
                          aria-selected={activa}
                          aria-controls="lente-panel"
                          onClick={() => cambiar("lente", id === "red" ? null : id)}
                          className={`rounded-full px-4 py-[7px] font-display text-[13px] transition-colors @lg:px-[18px] ${
                            activa
                              ? "bg-primary font-semibold text-primary-fg"
                              : "font-medium text-fg-secondary hover:text-fg"
                          }`}
                        >
                          {texto}
                        </button>
                      );
                    })}
                  </div>

                  <div
                    id="lente-panel"
                    role="tabpanel"
                    aria-labelledby={`lente-${lente}`}
                    tabIndex={-1}
                    className="outline-none"
                  >
                    {lente === "red" ? (
                      redes.error ? (
                        <AnaliticasError compacto onReintentar={redes.reintentar} />
                      ) : !redes.datos ? (
                        <LenteSkeleton />
                      ) : (
                        <LentePorRed
                          redes={redesVisibles}
                          red={red}
                          periodo={periodo}
                          ahora={ahora}
                          timeZone={timeZone}
                        />
                      )
                    ) : publicaciones.error ? (
                      <AnaliticasError compacto onReintentar={publicaciones.reintentar} />
                    ) : !publicaciones.datos ? (
                      <LenteSkeleton forma="tabla" />
                    ) : (
                      <LentePorPublicacion
                        publicaciones={publicaciones.datos.publicaciones}
                        ahora={ahora}
                        timeZone={timeZone}
                      />
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
