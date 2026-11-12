import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { PropuestaDeVozDto, PropuestasDeVozDto } from "@presencia/shared";
import { apiFetch } from "../lib/api.js";

// «Aprender de mis ediciones» (F12.5). Lo comparten la sección de Voz de marca
// y el punto del sub-nav de Configuración: aceptar o descartar la última
// propuesta apaga el punto sin volver a preguntar al servidor.
//
// Las propuestas de «Revisar mis ediciones» (origen "ia") viven solo aquí:
// son efímeras (se pierden al recargar), y una revisión nueva reemplaza a la
// anterior.

interface VozVivaState {
  datos: PropuestasDeVozDto | null;
  error: boolean;
  cargar: () => Promise<void>;
  poner: (datos: PropuestasDeVozDto) => void;
  quitar: (id: string) => void;
  ponerRevision: (propuestas: PropuestaDeVozDto[]) => void;
}

// Una sola lectura en vuelo: el layout y la sección la piden al montar.
let enVuelo: Promise<void> | null = null;
// Cuántas veces se escribió el store desde la pantalla. Una lectura que salió
// antes de una escritura (prender o apagar, "Agregar", una revisión) trae datos
// viejos y no la pisa (revisión del PR6).
let escrituras = 0;

// Las propuestas de la última revisión con IA, ya pagadas, sin decidir. Viven
// aparte del resto porque el servidor no las conoce: apagar y volver a prender
// no debe tirarlas (revisión del PR6). Apagado, solo no se muestran.
let revisionPagada: PropuestaDeVozDto[] = [];

/** Lo que dice el servidor, más la revisión pagada si sigue aprendiendo. */
function conRevision(nuevos: PropuestasDeVozDto): PropuestasDeVozDto {
  return nuevos.aprender
    ? { ...nuevos, propuestas: [...nuevos.propuestas, ...revisionPagada] }
    : nuevos;
}

export const useVozVivaStore = create<VozVivaState>()(
  devtools(
    (set, get) => ({
      datos: null,
      error: false,
      cargar: () => {
        const mia = escrituras;
        enVuelo ??= apiFetch<PropuestasDeVozDto>("/api/brand-voice/propuestas")
          .then((datos) => {
            if (escrituras !== mia) return;
            set({ datos: conRevision(datos), error: false }, false, "vozViva/cargar");
          })
          .catch(() => {
            if (escrituras === mia) set({ error: true }, false, "vozViva/error");
          })
          .finally(() => {
            enVuelo = null;
          });
        return enVuelo;
      },
      // Prender o apagar: la revisión ya pagada se queda si sigue aprendiendo.
      poner: (datos) => {
        escrituras++;
        set({ datos: conRevision(datos), error: false }, false, "vozViva/poner");
      },
      quitar: (id) => {
        escrituras++;
        revisionPagada = revisionPagada.filter((p) => p.id !== id);
        const datos = get().datos;
        if (!datos) return;
        set(
          { datos: { ...datos, propuestas: datos.propuestas.filter((p) => p.id !== id) } },
          false,
          "vozViva/quitar",
        );
      },
      ponerRevision: (propuestas) => {
        escrituras++;
        revisionPagada = propuestas;
        const datos = get().datos;
        // Apagado mientras el modelo pensaba: no se muestra (ni prende el punto).
        if (!datos?.aprender) return;
        set(
          {
            datos: {
              ...datos,
              propuestas: [...datos.propuestas.filter((p) => p.origen === "regla"), ...propuestas],
            },
          },
          false,
          "vozViva/revision",
        );
      },
    }),
    { name: "voz-viva" },
  ),
);

/** Para historias y tests: el store y su estado de módulo vuelven a cero. */
export function resetVozVivaStore(): void {
  revisionPagada = [];
  escrituras++;
  useVozVivaStore.setState({ datos: null, error: false });
}
