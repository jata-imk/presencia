import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { PropuestaDeVozDto, PropuestasDeVozDto } from "@presencia/shared";
import { apiFetch } from "../lib/api.js";

// «Aprender de mis ediciones» (F12.5). Lo comparten la sección de Voz de marca
// y el punto del sub-nav de Configuración: aceptar o descartar la última
// propuesta apaga el punto sin volver a preguntar al servidor.
//
// Las propuestas de «Revisar mis ediciones» (origen "ia") viven solo aquí:
// son efímeras, y una revisión nueva reemplaza a la anterior.

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

export const useVozVivaStore = create<VozVivaState>()(
  devtools(
    (set, get) => ({
      datos: null,
      error: false,
      cargar: () => {
        enVuelo ??= apiFetch<PropuestasDeVozDto>("/api/brand-voice/propuestas")
          .then((datos) => {
            // Las de una revisión con IA siguen en pantalla hasta que decida.
            const revision = get().datos?.propuestas.filter((p) => p.origen === "ia") ?? [];
            set(
              { datos: { ...datos, propuestas: [...datos.propuestas, ...revision] }, error: false },
              false,
              "vozViva/cargar",
            );
          })
          .catch(() => set({ error: true }, false, "vozViva/error"))
          .finally(() => {
            enVuelo = null;
          });
        return enVuelo;
      },
      poner: (datos) => set({ datos, error: false }, false, "vozViva/poner"),
      quitar: (id) => {
        const datos = get().datos;
        if (!datos) return;
        set(
          { datos: { ...datos, propuestas: datos.propuestas.filter((p) => p.id !== id) } },
          false,
          "vozViva/quitar",
        );
      },
      ponerRevision: (propuestas) => {
        const datos = get().datos;
        if (!datos) return;
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
