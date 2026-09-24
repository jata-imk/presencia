import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { SocialNetwork } from "@presencia/shared";
import { CadenciaHeatmap, LeyendaHeatmap } from "../components/ritmo/CadenciaHeatmap.js";
import { Narracion } from "../components/ritmo/Narracion.js";
import { HorariosHeatmap } from "../components/ritmo/HorariosHeatmap.js";
import {
  Bloque,
  CabeceraRitmo,
  FilaObjetivo,
  TarjetaTendencia,
  TituloBloque,
  AccionesTendencias,
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
import { TarjetaPropuesta } from "../components/ritmo/TarjetaPropuesta.js";
import { elegirPropuestas, promptDePropuesta, type ConPropuesta } from "../lib/ritmo/propuestas.js";
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
  const {
    tendencias,
    actualizar: actualizarTendencias,
    errorRefresco,
    cuotaAgotada: cuotaTendencias,
    descartarCuota: descartarCuotaTendencias,
  } = useTendencias();
  const narracion = useNarracion();
  const navigate = useNavigate();
  const propuestas = useMemo(() => elegirPropuestas(tendencias?.items ?? []), [tendencias]);

  // "Crear en Chat" deja el texto escrito en el composer de un chat nuevo y
  // NO manda nada: Ritmo propone, el Chat crea (presencia-ritmo.md §3). Viaja
  // como `propuesta` y no como `initialPrompt`, que sí dispara la generación.
  function crearEnChat(item: ConPropuesta) {
    void navigate("/chats", { state: { propuesta: promptDePropuesta(item) } });
  }

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
    // `pb-16` y no `py-7`: el scroller de protected.tsx no aporta ningún
    // padding inferior, así que el colchón del final lo pone cada ruta. Con 28px
    // el final de la página no se distinguía de los 24 de `gap-6` entre bloques
    // y la última fila de tendencias se leía como cortada.
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 pt-7 pb-16">
      <CabeceraRitmo
        nombre={primerNombre(session?.user.displayName ?? session?.user.name)}
        objetivos={resumen.objetivos}
        racha={resumen.cadencia.rachaActual}
        publico={!sinPublicaciones}
        modo={resumen.modo}
        modoSugerido={resumen.modoSugerido}
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
            {/* La racha actual se fue a la cabecera; "Mejor racha" se queda
                acá, que es donde el usuario puede rastrearla contra las celdas
                encendidas del mapa. */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-xs text-fg-muted">
                  Mejor racha: {resumen.cadencia.mejorRacha}{" "}
                  {resumen.cadencia.mejorRacha === 1 ? "día" : "días"} · {resumen.cadencia.total}{" "}
                  {/* El tamaño sale de la rejilla que mandó el servidor, no de
                      una constante repetida acá: la ventana la fija el motor y
                      el cliente no tiene por qué saber cuánto vale. */}
                  {/* `ceil` y no `round`, por lo mismo que en narracion.ts: la
                      rejilla arranca en el lunes de hace 16 semanas y termina
                      hoy, así que mide entre 106 y 112 días y `round` daba 15
                      de lunes a miércoles. La narración vive dos bloques más
                      arriba en esta misma pantalla, así que el usuario leía 15
                      y 16 para el mismo dato. */}
                  publicaciones en {Math.ceil(resumen.cadencia.dias.length / 7)} semanas
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
            derecha={
              <AccionesTendencias
                datos={tendencias}
                onActualizar={actualizarTendencias}
                error={errorRefresco}
              />
            }
          />
          {tendencias.items.length === 0 ? (
            <TendenciasVacias datos={tendencias} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tendencias.items.map((item) => (
                <TarjetaTendencia key={item.topic} item={item} />
              ))}
            </div>
          )}
        </section>
      )}

      {propuestas.length > 0 && (
        <section>
          <TituloBloque
            kicker="De la tendencia a la acción"
            titulo="Propuestas de publicación"
            sub="Ideas concretas listas para crear. El Chat es donde nace el contenido."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {propuestas.map((item) => (
              <TarjetaPropuesta key={item.topic} item={item} onCrear={crearEnChat} />
            ))}
          </div>
        </section>
      )}

      {cuotaTendencias && (
        <QuotaExhaustedModal quota={cuotaTendencias} onDismiss={descartarCuotaTendencias} />
      )}
      {narracion.cuotaAgotada && (
        <QuotaExhaustedModal quota={narracion.cuotaAgotada} onDismiss={narracion.descartarCuota} />
      )}
    </div>
  );
}
