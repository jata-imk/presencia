import { useMemo, useState } from "react";
import type { RitmoDiaDto, SocialNetwork } from "@presencia/shared";
import { Tooltip } from "../ui/Tooltip.js";

// El heatmap de cadencia: una celda por día, 16 semanas en columnas.
//
// Construido a mano con grid de CSS y sin librería de gráficas, igual que el
// Calendario (ADR-018). Son 112 divs de color: una dependencia de charting
// pesaría más que todo esto y habría que pelearle el tema y los tokens.

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * De cuántas publicaciones en un día a qué tono le toca.
 *
 * `0` es su propio paso y no el primero de la rampa: un día sin publicar y
 * uno con una publicación floja son cosas distintas, y el heatmap no puede
 * confundirlas. El tope en 4 es de la escala, no del usuario — publicar seis
 * veces un día se ve igual que cuatro, y está bien: lo que el mapa cuenta es
 * constancia, no volumen.
 */
function tono(total: number): string {
  if (total <= 0) return "bg-ritmo-heat-0";
  if (total === 1) return "bg-ritmo-heat-1";
  if (total === 2) return "bg-ritmo-heat-2";
  if (total === 3) return "bg-ritmo-heat-3";
  return "bg-ritmo-heat-4";
}

function etiquetaDe(dia: string): string {
  const [, mes, numero] = dia.split("-");
  return `${Number(numero)} ${MESES[Number(mes) - 1]?.toLowerCase() ?? ""}`;
}

interface Props {
  dias: RitmoDiaDto[];
  /**
   * Una sola red en vez del total.
   *
   * El conteo sale de `porRed`, que el servidor ya manda por día: filtrar acá
   * evita una segunda llamada por red y evita que el cliente y el servidor
   * cuenten distinto.
   */
  network?: SocialNetwork;
  /** La variante chica es para la rejilla de cuatro mapas de "Por red". */
  compacto?: boolean;
}

export function CadenciaHeatmap({ dias, network, compacto = false }: Props) {
  const lado = compacto ? "h-3 w-3" : "h-[22px] w-[22px]";
  const totalDe = (dia: RitmoDiaDto) => (network ? (dia.porRed[network] ?? 0) : dia.total);
  const [foco, setFoco] = useState<string | null>(null);

  // Las semanas son columnas de 7. La rejilla llega completa desde el
  // servidor —incluidos los días en cero— justo para no tener que reconstruir
  // acá la aritmética de zona horaria.
  const semanas = useMemo(() => {
    const columnas: RitmoDiaDto[][] = [];
    for (let i = 0; i < dias.length; i += 7) columnas.push(dias.slice(i, i + 7));
    return columnas;
  }, [dias]);

  // Una etiqueta de mes por columna donde el mes cambia.
  const meses = useMemo(
    () =>
      semanas.map((semana, indice) => {
        const primero = semana[0];
        if (!primero) return null;
        const mes = Number(primero.dia.split("-")[1]);
        const anterior = semanas[indice - 1]?.[0];
        const mesAnterior = anterior ? Number(anterior.dia.split("-")[1]) : -1;
        return mes !== mesAnterior ? (MESES[mes - 1] ?? null) : null;
      }),
    [semanas],
  );

  return (
    <div className="overflow-x-auto pb-1">
      <div className={`inline-flex flex-col ${compacto ? "gap-0.5" : "gap-1"}`}>
        <div className={`flex gap-1 pl-9 ${compacto ? "hidden" : ""}`}>
          {meses.map((mes, indice) => (
            <span
              key={semanas[indice]?.[0]?.dia ?? indice}
              className="w-[22px] shrink-0 text-[10px] font-semibold text-fg-muted"
            >
              {mes}
            </span>
          ))}
        </div>
        <div className={`flex ${compacto ? "gap-0.5" : "gap-1"}`}>
          <div className={`flex w-8 shrink-0 flex-col gap-1 pr-1 ${compacto ? "hidden" : ""}`}>
            {DIAS.map((dia, indice) => (
              <span
                key={dia}
                className="flex h-[22px] items-center justify-end text-[10px] text-fg-muted"
              >
                {/* Una de cada dos, como el mock: con las siete el eje compite
                    con las celdas y el mapa se lee peor. */}
                {indice % 2 === 0 ? dia : ""}
              </span>
            ))}
          </div>
          {semanas.map((semana, indice) => (
            <div
              key={semana[0]?.dia ?? indice}
              className={`flex flex-col ${compacto ? "gap-0.5" : "gap-1"}`}
            >
              {semana.map((dia) => (
                // `label` vacío apaga el tooltip, así que un día sin publicar
                // no ofrece nada que inspeccionar sin necesitar dos ramas.
                <Tooltip
                  key={dia.dia}
                  label={
                    totalDe(dia) === 0
                      ? undefined
                      : `${String(totalDe(dia))} ${totalDe(dia) === 1 ? "publicación" : "publicaciones"} · ${etiquetaDe(dia.dia)}`
                  }
                >
                  <div
                    onMouseEnter={() => setFoco(dia.dia)}
                    onMouseLeave={() => setFoco(null)}
                    className={`${lado} ${compacto ? "rounded-sm" : "rounded-md"} ${tono(totalDe(dia))} ${
                      totalDe(dia) === 0 ? "border border-line-subtle" : ""
                    } ${!compacto && foco === dia.dia ? "ring-2 ring-primary" : ""}`}
                  />
                </Tooltip>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeyendaHeatmap() {
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
      <span>menos</span>
      <span className="h-3.5 w-3.5 rounded-sm bg-ritmo-heat-0" />
      <span className="h-3.5 w-3.5 rounded-sm bg-ritmo-heat-1" />
      <span className="h-3.5 w-3.5 rounded-sm bg-ritmo-heat-2" />
      <span className="h-3.5 w-3.5 rounded-sm bg-ritmo-heat-3" />
      <span className="h-3.5 w-3.5 rounded-sm bg-ritmo-heat-4" />
      <span>más</span>
    </div>
  );
}

/**
 * La racha, en tile, a la derecha de la cabecera.
 *
 * Traducido del mock de Claude Design (`ritmo/RitmoSections.jsx`, `RachaTile` y
 * la variante A de `StrategyHeader`), no del doc: el doc la describe como un
 * chip y el diseño la resolvió como una tarjeta con el número gigante. La
 * primera versión de esto era una píldora con un icono de lucide y no se
 * parecía en nada.
 *
 * **Sin racha no es este tile en gris: es otro.** El mock no apaga la tarjeta,
 * la cambia por una punteada con un brote. Es la diferencia entre "tu racha
 * está apagada" y "tu racha todavía no empieza", que es lo que de verdad pasa
 * el día 1 — y el doc es explícito en que la racha nunca se inventa.
 *
 * Los emojis son emojis, no iconos: 🔥 y 🌱 salen del mock tal cual.
 */
export function RachaTile({ dias }: { dias: number }) {
  if (dias === 0) {
    return (
      <div className="flex max-w-[240px] items-center gap-3 rounded-2xl border border-dashed border-ritmo-sin-racha-border bg-card px-5 py-4">
        <span className="text-[22px] leading-none" aria-hidden>
          🌱
        </span>
        <span className="font-display text-[13px] font-medium text-accent">
          Tu racha empieza con tu primer post.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-ritmo-racha-border bg-linear-to-br from-ritmo-racha-desde to-ritmo-racha-hasta px-[22px] py-4">
      <span className="text-[34px] leading-none" aria-hidden>
        🔥
      </span>
      <div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[46px] leading-[0.9] font-bold tracking-[-0.02em] text-brand">
            {dias}
          </span>
          <span className="font-display text-sm font-semibold text-accent">
            {dias === 1 ? "día" : "días"}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-fg-secondary">
          {dias === 1 ? "publicando" : "seguidos publicando"}
        </div>
      </div>
    </div>
  );
}
