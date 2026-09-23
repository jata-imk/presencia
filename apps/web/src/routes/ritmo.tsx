import { useEffect, useState } from "react";
import type { SocialNetwork } from "@presencia/shared";
import { CadenciaHeatmap, LeyendaHeatmap, RachaPill } from "../components/ritmo/CadenciaHeatmap.js";
import { Narracion } from "../components/ritmo/Narracion.js";
import { HorariosHeatmap } from "../components/ritmo/HorariosHeatmap.js";
import {
  Bloque,
  CabeceraRitmo,
  FilaObjetivo,
  TarjetaTendencia,
  TituloBloque,
  nombreDeRed,
} from "../components/ritmo/RitmoSections.js";
import {
  CadenciaVacia,
  HorariosNoReporta,
  HorariosPocaData,
  HorariosSinData,
  HorariosSkeleton,
  RitmoError,
  RitmoSkeleton,
  TendenciasVacias,
} from "../components/ritmo/RitmoStates.js";
import { NETWORK_META } from "../components/cards/NetworkLogos.js";
import { QuotaExhaustedModal } from "../components/QuotaExhaustedModal.js";
import { authClient } from "../lib/auth-client.js";
import { useHorarios, useNarracion, useRitmoResumen, useTendencias } from "../lib/use-ritmo.js";

// La pantalla de Ritmo: compone, no calcula.
//
// Los tres recursos viven en sus propios hooks (lib/use-ritmo.ts) porque
// fallan por su cuenta — que la fuente de tendencias se caiga no puede dejar
// al usuario sin su heatmap.

/** "Jose Tejero" → "Jose". El saludo tutea; el apellido lo vuelve formal. */
function primerNombre(nombre: string | null | undefined): string {
  const primero = nombre?.trim().split(/\s+/)[0];
  return primero && primero.length > 0 ? primero : "creator";
}

export function RitmoPage() {
  const { data: session } = authClient.useSession();
  const { resumen, error, errorGuardado, guardando, recargar, cambiarMeta } = useRitmoResumen();
  const { tendencias, recargar: recargarTendencias } = useTendencias();
  const narracion = useNarracion();

  // `null` hasta que el resumen diga qué redes hay. La elección del usuario
  // sobrevive a las recargas del resumen (guardar una meta lo devuelve entero).
  const [red, setRed] = useState<SocialNetwork | null>(null);
  const primeraRed = resumen?.redesConectadas[0] ?? null;
  useEffect(() => {
    setRed((actual) => actual ?? primeraRed);
  }, [primeraRed]);

  const { horarios, error: errorHorarios, reintentar: reintentarHorarios } = useHorarios(red);

  // "Agregado" o "Por red" para el heatmap de cadencia. Vive en la página y no
  // en el componente del mapa porque el control que lo cambia está en la
  // cabecera del bloque, no dentro del mapa.
  const [vistaCadencia, setVistaCadencia] = useState<"agregado" | "red">("agregado");

  if (error) {
    return (
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 py-7">
        <RitmoError mensaje={error} onReintentar={recargar} />
      </div>
    );
  }
  if (!resumen) {
    return (
      <div className="mx-auto max-w-[1120px] px-6 py-7">
        <RitmoSkeleton />
      </div>
    );
  }

  const sinPublicaciones = resumen.cadencia.total === 0;

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 py-7">
      <CabeceraRitmo
        nombre={primerNombre(session?.user.displayName ?? session?.user.name)}
        objetivos={resumen.objetivos}
      />

      {/* Sin publicaciones no hay nada que narrar: el modelo solo podría
          decirle que no ha publicado, cobrando por la frase. El estado vacío
          de la cadencia ya dice eso, gratis y sin inventar. */}
      {!sinPublicaciones && (
        <Narracion
          narracion={narracion.narracion}
          generando={narracion.generando}
          error={narracion.error}
          timezone={resumen.timezone}
          onPedir={narracion.pedir}
        />
      )}

      <Bloque>
        <TituloBloque
          kicker="El pulso de tu constancia"
          titulo="Cadencia de publicación"
          sub="Cada celda es un día. Mientras más publicas, más fuerte el color."
          derecha={
            sinPublicaciones || resumen.redesConectadas.length < 2 ? undefined : (
              <div
                role="tablist"
                aria-label="Vista de la cadencia"
                className="inline-flex gap-1 rounded-full bg-secondary p-1"
              >
                {(["agregado", "red"] as const).map((vista) => (
                  <button
                    key={vista}
                    role="tab"
                    aria-selected={vistaCadencia === vista}
                    onClick={() => setVistaCadencia(vista)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      vistaCadencia === vista
                        ? "bg-card text-fg shadow-sm"
                        : "text-fg-secondary hover:text-fg"
                    }`}
                  >
                    {vista === "agregado" ? "Agregado" : "Por red"}
                  </button>
                ))}
              </div>
            )
          }
        />
        {sinPublicaciones ? (
          <CadenciaVacia />
        ) : vistaCadencia === "red" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {resumen.redesConectadas.map((network) => {
              const meta = NETWORK_META[network];
              return (
                <div key={network} className="rounded-xl border border-line-subtle p-3">
                  <div className="mb-2.5 flex items-center gap-2">
                    <meta.Logo size={16} />
                    <span className="text-[13px] font-semibold text-fg">{meta.label}</span>
                  </div>
                  <CadenciaHeatmap dias={resumen.cadencia.dias} network={network} compacto />
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <CadenciaHeatmap dias={resumen.cadencia.dias} />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <RachaPill dias={resumen.cadencia.rachaActual} />
                <span className="text-xs text-fg-muted">
                  Mejor racha: {resumen.cadencia.mejorRacha}{" "}
                  {resumen.cadencia.mejorRacha === 1 ? "día" : "días"} · {resumen.cadencia.total}{" "}
                  {/* El tamaño sale de la rejilla que mandó el servidor, no de
                      una constante repetida acá: la ventana la fija el motor y
                      el cliente no tiene por qué saber cuánto vale. */}
                  publicaciones en {Math.round(resumen.cadencia.dias.length / 7)} semanas
                </span>
              </div>
              <LeyendaHeatmap />
            </div>
          </>
        )}
      </Bloque>

      {resumen.objetivos.length > 0 && (
        <Bloque>
          <TituloBloque
            kicker="Tu meta semanal"
            titulo="Cadencia objetivo por red"
            sub="Ajusta cuántas veces quieres publicar. Mientras no la cambies, usamos una sugerencia."
          />
          {errorGuardado && (
            <p role="alert" className="mb-3 text-[13px] text-error">
              {errorGuardado}
            </p>
          )}
          {resumen.objetivos.map((objetivo) => (
            <FilaObjetivo
              key={objetivo.network}
              objetivo={objetivo}
              guardando={guardando}
              onCambiar={(meta) => void cambiarMeta(objetivo.network, meta)}
            />
          ))}
        </Bloque>
      )}

      {red && (
        <Bloque>
          <TituloBloque
            kicker="Cuándo te escuchan"
            titulo="Mejores horarios"
            sub="Intensidad = engagement promedio. Marcamos tus mejores ventanas."
            derecha={
              <div
                role="tablist"
                aria-label="Red social"
                className="inline-flex gap-1 rounded-full bg-secondary p-1"
              >
                {resumen.redesConectadas.map((network) => {
                  const meta = NETWORK_META[network];
                  const activa = network === red;
                  return (
                    <button
                      key={network}
                      role="tab"
                      aria-selected={activa}
                      onClick={() => setRed(network)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activa ? "bg-card text-fg shadow-sm" : "text-fg-secondary hover:text-fg"
                      }`}
                    >
                      <meta.Logo size={14} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            }
          />
          {errorHorarios ? (
            <RitmoError mensaje={errorHorarios} onReintentar={reintentarHorarios} />
          ) : !horarios ? (
            <HorariosSkeleton />
          ) : horarios.modo === "cold" ? (
            <HorariosSinData />
          ) : horarios.modo === "no_reporta" ? (
            <HorariosNoReporta red={nombreDeRed(horarios.network)} />
          ) : horarios.modo === "poca" ? (
            <HorariosPocaData n={horarios.nTotal} />
          ) : (
            <HorariosHeatmap datos={horarios} />
          )}
        </Bloque>
      )}

      {tendencias && (
        <section>
          <TituloBloque
            kicker="El corazón cultural · MX"
            titulo="Tendencias en tu nicho"
            sub="Temas moviéndose ahora. Citamos siempre la fuente."
          />
          {tendencias.items.length === 0 ? (
            <TendenciasVacias datos={tendencias} onReintentar={recargarTendencias} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tendencias.items.map((item) => (
                <TarjetaTendencia key={item.topic} item={item} />
              ))}
            </div>
          )}
        </section>
      )}

      {narracion.cuotaAgotada && (
        <QuotaExhaustedModal quota={narracion.cuotaAgotada} onDismiss={narracion.descartarCuota} />
      )}
    </div>
  );
}
