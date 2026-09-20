import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RitmoHorariosDto,
  RitmoResumenDto,
  SocialNetwork,
  TrendsDto,
} from "@presencia/shared";
import { CadenciaHeatmap, LeyendaHeatmap } from "../components/ritmo/CadenciaHeatmap.js";
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
  RitmoError,
  RitmoSkeleton,
  TendenciasVacias,
} from "../components/ritmo/RitmoStates.js";
import { NETWORK_META } from "../components/cards/NetworkLogos.js";
import { ApiError } from "../lib/api.js";
import { fetchHorarios, fetchResumen, fetchTendencias, saveMetaSemanal } from "../lib/ritmo-api.js";
import { authClient } from "../lib/auth-client.js";

// La pantalla de Ritmo.
//
// Tres cargas independientes a propósito: el resumen, los horarios de la red
// elegida y las tendencias fallan por su cuenta. Que la fuente de tendencias
// se caiga no puede dejar al usuario sin su heatmap, y que una red no reporte
// no apaga el resto de la vista.

const ERROR_GENERICO = "No pudimos cargar tu ritmo. Inténtalo de nuevo.";

/** "Jose Tejero" → "Jose". El saludo tutea; el apellido lo vuelve formal. */
function primerNombre(nombre: string | null | undefined): string {
  const primero = nombre?.trim().split(/\s+/)[0];
  return primero && primero.length > 0 ? primero : "creator";
}

export function RitmoPage() {
  const { data: session } = authClient.useSession();
  const [resumen, setResumen] = useState<RitmoResumenDto | null>(null);
  const [errorResumen, setErrorResumen] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [red, setRed] = useState<SocialNetwork | null>(null);
  const [horarios, setHorarios] = useState<RitmoHorariosDto | null>(null);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);

  const [tendencias, setTendencias] = useState<TrendsDto | null>(null);

  const cargarResumen = useCallback(() => {
    setErrorResumen(null);
    fetchResumen()
      .then((datos) => {
        setResumen(datos);
        // La primera red conectada manda; si el usuario ya eligió pestaña, se
        // respeta aunque el resumen se recargue al guardar una meta.
        setRed((actual) => actual ?? datos.redesConectadas[0] ?? null);
      })
      .catch((e: unknown) => setErrorResumen(e instanceof ApiError ? e.message : ERROR_GENERICO));
  }, []);

  useEffect(cargarResumen, [cargarResumen]);

  // Las tendencias no tumban la pantalla si fallan: se quedan en null y la
  // sección no se pinta. Es información secundaria de la vista.
  const cargarTendencias = useCallback(() => {
    fetchTendencias()
      .then(setTendencias)
      .catch(() => setTendencias(null));
  }, []);

  useEffect(cargarTendencias, [cargarTendencias]);

  // Guarda de carrera del mismo tipo que cards-store: la respuesta de una red
  // que el usuario ya abandonó no puede pisar la de la pestaña actual.
  const pedido = useRef(0);
  useEffect(() => {
    if (!red) return;
    const token = ++pedido.current;
    const abort = new AbortController();
    setCargandoHorarios(true);
    fetchHorarios(red, abort.signal)
      .then((datos) => {
        if (token === pedido.current) setHorarios(datos);
      })
      .catch(() => {
        if (token === pedido.current) setHorarios(null);
      })
      .finally(() => {
        if (token === pedido.current) setCargandoHorarios(false);
      });
    return () => {
      abort.abort();
    };
  }, [red]);

  async function cambiarMeta(network: SocialNetwork, meta: number) {
    setGuardando(true);
    try {
      setResumen(await saveMetaSemanal(network, meta));
    } catch {
      // El servidor manda el estado bueno; recargar deja la fila como quedó
      // de verdad en vez de dejar la UI afirmando un número que no se guardó.
      cargarResumen();
    } finally {
      setGuardando(false);
    }
  }

  if (errorResumen) {
    return (
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-6 py-7">
        <RitmoError mensaje={errorResumen} onReintentar={cargarResumen} />
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
        // Mismo orden que el sidebar: displayName gana al nombre de la cuenta.
        nombre={primerNombre(session?.user.displayName ?? session?.user.name)}
        racha={resumen.cadencia.rachaActual}
        objetivos={resumen.objetivos}
      />

      <Bloque>
        <TituloBloque
          kicker="El pulso de tu constancia"
          titulo="Cadencia de publicación"
          sub="Cada celda es un día. Mientras más publicas, más fuerte el color."
          derecha={sinPublicaciones ? undefined : <LeyendaHeatmap />}
        />
        {sinPublicaciones ? (
          <CadenciaVacia />
        ) : (
          <>
            <CadenciaHeatmap dias={resumen.cadencia.dias} />
            <p className="mt-4 text-xs text-fg-muted">
              Mejor racha: {resumen.cadencia.mejorRacha}{" "}
              {resumen.cadencia.mejorRacha === 1 ? "día" : "días"} · {resumen.cadencia.total}{" "}
              publicaciones en 16 semanas
            </p>
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
            sub="Intensidad = engagement promedio de tus publicaciones."
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
          {cargandoHorarios && !horarios ? (
            <div className="h-[300px] animate-pulse rounded-xl bg-secondary" aria-hidden />
          ) : !horarios ? (
            <HorariosSinData />
          ) : horarios.modo === "no_reporta" ? (
            <HorariosNoReporta red={nombreDeRed(horarios.network)} />
          ) : horarios.modo === "cold" ? (
            <HorariosSinData />
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
            <TendenciasVacias datos={tendencias} onReintentar={cargarTendencias} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tendencias.items.map((item) => (
                <TarjetaTendencia key={item.topic} item={item} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
