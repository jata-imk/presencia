import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  socialNetworkSchema,
  type AnaliticasPublicacionDetalleDto,
  type HallazgoFormatoDto,
  type MuestraDeRed,
  type PeriodoAnaliticas,
  type SocialNetwork,
} from "@presencia/shared";
import { BarraControl } from "../components/analiticas/BarraControl.js";
import { DetallePublicacion } from "../components/analiticas/DetallePublicacion.js";
import {
  Hallazgos,
  HallazgosSkeleton,
  SeccionHallazgos,
} from "../components/analiticas/Hallazgos.js";
import { LentePorConcepto } from "../components/analiticas/LentePorConcepto.js";
import { LentePorPublicacion } from "../components/analiticas/LentePorPublicacion.js";
import { LentePorRed } from "../components/analiticas/LentePorRed.js";
import {
  MejoresPublicaciones,
  MejoresSkeleton,
  SeccionMejores,
} from "../components/analiticas/MejoresPublicaciones.js";
import { ResumenKpis } from "../components/analiticas/ResumenKpis.js";
import {
  AnaliticasError,
  AnaliticasSkeleton,
  CeroAbsoluto,
  LenteSkeleton,
} from "../components/analiticas/AnaliticasStates.js";
import { textoAdaptar } from "../lib/adaptar.js";
import { propuestaDeHallazgo } from "../lib/analiticas/formato.js";
import { useTimezone } from "../lib/calendar/use-timezone.js";
import { useMediaQuery } from "../lib/use-media-query.js";
import { usePublicationPanelStore } from "../stores/publication-panel-store.js";
import {
  useAnaliticasDetalle,
  useAnaliticasHallazgos,
  useAnaliticasPublicaciones,
  useAnaliticasRedes,
  useAnaliticasResumen,
} from "../lib/analiticas/use-analiticas.js";

// La pantalla de Analíticas (F12, `presencia-analiticas.md`): compone, no
// calcula. Todos los números salen del motor (addendum F12 de ADR-022); el
// copy de los estados, de lib/analiticas/formato.ts.
//
// Una vista y no tabs por sección (lore doc §7): arriba lo que se lee de un
// vistazo (el resumen, "Tus mejores publicaciones" y "Hallazgos"), abajo las
// lentes para escarbar. Las lentes sí son tabs: muestran lo mismo cortado
// distinto. Cada sección carga y falla por su cuenta.
//
// Periodo, red, lente y la publicación abierta (`post`) viven en la URL: al
// volver del chat de origen con "atrás", la pantalla queda como estaba, y
// "Ver estadísticas" (Chat, Calendario) llega con `?post=<cardId>`.
//
// Maneja su propio alto (`handle.ownScroll`) y tiene dos `@container`, como
// Biblioteca: la raíz, contra la que se acomoda el panel de detalle, y la
// columna, contra la que se acomoda todo lo demás. A diferencia de
// Biblioteca, el detalle va siempre ENCIMA con velo (desde @lg) y no empuja:
// se abre para leer una publicación y volver a la lista, no para trabajar al
// lado de ella.

type Lente = "red" | "publicacion" | "concepto";

const LENTES: { id: Lente; texto: string }[] = [
  { id: "red", texto: "Por red" },
  { id: "publicacion", texto: "Por publicación" },
  { id: "concepto", texto: "Por concepto" },
];

function lenteDe(valor: string | null): Lente {
  return valor === "publicacion" || valor === "concepto" ? valor : "red";
}

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
  const lente = lenteDe(params.get("lente"));
  const post = params.get("post") || null;
  const navigate = useNavigate();
  const esEscritorio = useMediaQuery("(min-width: 1024px)");

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
  // Siempre 90 días: el periodo de arriba no lo mueve, la red sí.
  const hallazgos = useAnaliticasHallazgos(red);
  // Abre aunque la publicación sea más vieja que el periodo (lore doc §6): la
  // lista de atrás no cambia.
  const detalle = useAnaliticasDetalle(post, periodo);
  // Su propio "ahora": el panel puede abrirse mucho después de que llegó el
  // resumen, y su "Medido hace…" se diría contra un instante viejo.
  const ahoraDetalle = useMemo(() => new Date(), [detalle.datos]);

  // Un solo "ahora" por respuesta: la tendencia y los "hace…" de la tabla se
  // etiquetan contra el mismo instante.
  const ahora = useMemo(() => new Date(), [resumen.datos]);

  const redesConPublicaciones = useMemo(
    () => redes.datos?.redes.map((r) => r.network) ?? [],
    [redes.datos],
  );
  // Por concepto dice por qué una red no tiene número con su muestra.
  const muestraPorRed = useMemo(
    () =>
      new Map<SocialNetwork, MuestraDeRed>(
        (redes.datos?.redes ?? []).map((r) => [r.network, r.engagement.muestra]),
      ),
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

  // El elemento desde el que se abrió el detalle (una fila de la tabla, una
  // tarjeta de Mejores, una red de Por concepto): al cerrar, el foco vuelve a
  // él. Se guarda el elemento y no el cardId porque la misma card puede estar
  // en Mejores y en la tabla, y la primera en el DOM le ganaría a la que se
  // tocó. Saltar a una hermana no lo cambia. Si se llegó por "Ver
  // estadísticas" o el elemento ya no está (cambió la lente o el periodo), el
  // foco va al panel de la lente para no perderse en <body>.
  const abiertaDesde = useRef<HTMLElement | null>(null);

  function abrirDesdeFila(cardId: string) {
    abiertaDesde.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cambiar("post", cardId);
  }

  function abrirHermana(cardId: string) {
    cambiar("post", cardId);
  }

  // `post` también se va sin pasar por cerrar() (el link de Analíticas en el
  // sidebar, "atrás"): ahí la fila recordada ya no vale.
  useEffect(() => {
    if (!post) abiertaDesde.current = null;
  }, [post]);

  const cerrar = useCallback(() => {
    const fila = abiertaDesde.current;
    abiertaDesde.current = null;
    setParams(
      (actual) => {
        const siguiente = new URLSearchParams(actual);
        siguiente.delete("post");
        return siguiente;
      },
      { replace: true },
    );
    requestAnimationFrame(() => {
      const destino = fila?.isConnected ? fila : document.getElementById("lente-panel");
      destino?.focus({ preventScroll: destino.id === "lente-panel" });
    });
  }, [setParams]);

  // Esc cierra el detalle, pero solo si nace en esta pantalla (o en ningún
  // lado, con el foco en <body>): un Esc para el drawer del sidebar en móvil
  // o un menú de afuera que no lo marca como atendido no se lleva el panel.
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!post) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const origen = event.target as Node | null;
      if (origen !== document.body && !raiz.current?.contains(origen)) return;
      cerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [post, cerrar]);

  // Se llega al chat con esa card ya abierta en el panel, como "Abrir en el
  // chat" del Calendario y "Ver card" de Biblioteca.
  function abrirChat(publicacion: AnaliticasPublicacionDetalleDto) {
    if (!publicacion.chatId) return;
    usePublicationPanelStore
      .getState()
      .openForHandoff(publicacion.chatId, [publicacion.cardId], publicacion.cardId);
    void navigate(`/chats/${publicacion.chatId}`);
  }

  // "Adaptar" precarga el composer del chat de origen (chat.tsx consume
  // `state.borrador` una sola vez). Abajo de 1024 el panel taparía el
  // composer, así que ahí se llega sin él: la misma regla que
  // `PublicationPanel.adapt`.
  function adaptar(publicacion: AnaliticasPublicacionDetalleDto) {
    if (!publicacion.chatId) return;
    if (esEscritorio) {
      usePublicationPanelStore
        .getState()
        .openForHandoff(publicacion.chatId, [publicacion.cardId], publicacion.cardId);
    }
    void navigate(`/chats/${publicacion.chatId}`, {
      state: { borrador: textoAdaptar(publicacion.network) },
    });
  }

  // "Crear en Chat" de un hallazgo: un chat nuevo con la idea escrita en la
  // caja, sin mandarla (lore doc §5). El mismo contrato que las propuestas de
  // Ritmo (`state.propuesta`, que lee chats.tsx); `initialPrompt` sí enviaría.
  function crearEnChat(hallazgo: HallazgoFormatoDto) {
    void navigate("/chats", { state: { propuesta: propuestaDeHallazgo(hallazgo) } });
  }

  function verEnRitmo(redDelHallazgo: SocialNetwork) {
    void navigate(`/ritmo?red=${redDelHallazgo}`);
  }

  function reintentarTodo() {
    resumen.reintentar();
    redes.reintentar();
    publicaciones.reintentar();
    hallazgos.reintentar();
  }

  return (
    <div ref={raiz} className="@container relative flex h-full bg-surface">
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

                {publicaciones.error ? (
                  <SeccionMejores periodo={periodo}>
                    <AnaliticasError compacto onReintentar={publicaciones.reintentar} />
                  </SeccionMejores>
                ) : !publicaciones.datos ? (
                  <MejoresSkeleton periodo={periodo} />
                ) : (
                  <MejoresPublicaciones
                    publicaciones={publicaciones.datos.publicaciones}
                    mejores={publicaciones.datos.mejores}
                    periodo={periodo}
                    timeZone={timeZone}
                    onAbrir={abrirDesdeFila}
                  />
                )}

                {hallazgos.error ? (
                  <SeccionHallazgos>
                    <AnaliticasError compacto onReintentar={hallazgos.reintentar} />
                  </SeccionHallazgos>
                ) : !hallazgos.datos ? (
                  <HallazgosSkeleton />
                ) : (
                  <Hallazgos
                    hallazgos={hallazgos.datos}
                    onCrearEnChat={crearEnChat}
                    onVerEnRitmo={verEnRitmo}
                  />
                )}

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
                    ) : lente === "concepto" ? (
                      <LentePorConcepto
                        conceptos={publicaciones.datos.conceptos}
                        publicaciones={publicaciones.datos.publicaciones}
                        muestraPorRed={muestraPorRed}
                        ahora={ahora}
                        timeZone={timeZone}
                        activa={post}
                        onAbrir={abrirDesdeFila}
                      />
                    ) : (
                      <LentePorPublicacion
                        publicaciones={publicaciones.datos.publicaciones}
                        ahora={ahora}
                        timeZone={timeZone}
                        activa={post}
                        onAbrir={abrirDesdeFila}
                      />
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {post && (
        <>
          <div
            aria-hidden
            onClick={cerrar}
            className="absolute inset-0 z-20 hidden bg-overlay @lg:block"
          />
          <DetallePublicacion
            cardId={post}
            detalle={detalle.datos}
            error={detalle.error}
            noExiste={detalle.noExiste}
            ahora={ahoraDetalle}
            timeZone={timeZone}
            onCerrar={cerrar}
            onReintentar={detalle.reintentar}
            onAbrir={abrirHermana}
            onAbrirChat={abrirChat}
            onAdaptar={adaptar}
          />
        </>
      )}
    </div>
  );
}
