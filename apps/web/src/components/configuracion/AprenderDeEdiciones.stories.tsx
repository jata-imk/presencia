import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { PropuestasDeVozDto } from "@presencia/shared";
import { resetVozVivaStore } from "../../stores/voz-viva-store.js";
import { AprenderDeEdiciones } from "./AprenderDeEdiciones.js";

// «Aprender de mis ediciones» (F12.5, Claude Design "Voz de marca v3"). Los
// estados que en la app dependen de cuántas publicaciones editó el creator y
// de lo que tarde el modelo: aquí se ven todos de una vez.

const meta = {
  title: "Configuración/Aprender de mis ediciones",
  // El store es uno para toda la app: cada historia arranca limpia ANTES de
  // montar (un efecto del decorador correría después del de la sección y
  // descartaría su primera lectura), y la sección lo llena desde su
  // `parameters.api`.
  beforeEach: () => {
    resetVozVivaStore();
  },
  decorators: [
    (Story) => (
      <div className="max-w-(--content-max-w)">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CON_PROPUESTAS: PropuestasDeVozDto = {
  aprender: true,
  edicionesParaRevisar: 5,
  propuestas: [
    {
      id: "emojis",
      origen: "regla",
      mensaje: "Quitaste emojis en 4 de tus últimas 5 publicaciones.",
      rasgo: "Casi sin emojis",
      evidencia: [
        { antes: "Lunes de productividad 🚀🔥", despues: "Lunes de productividad." },
        { antes: "¿Cuál usas tú? Cuéntame 👇😄", despues: "¿Cuál usas tú? Cuéntame." },
      ],
    },
    {
      id: "largo",
      origen: "regla",
      mensaje: "Recortaste el texto en 4 de tus últimas 6 publicaciones.",
      rasgo: "Textos cortos y al grano",
      evidencia: [
        {
          antes: "Hoy te quiero contar algo que me pasó esta semana mientras organizaba mi agenda…",
          despues: "Esta semana cambié cómo organizo mi agenda.",
        },
      ],
    },
  ],
};

const api = (datos: PropuestasDeVozDto, extra: Record<string, unknown> = {}) => ({
  "/api/brand-voice/propuestas": { body: datos },
  "/api/brand-voice/propuestas/emojis/decision": { body: {} },
  "/api/brand-voice/propuestas/largo/decision": { body: {} },
  ...extra,
});

const agregar = { onAgregar: fn(() => Promise.resolve("ok" as const)) };

export const ConPropuestas: Story = {
  name: "Con propuestas",
  render: () => <AprenderDeEdiciones {...agregar} />,
  parameters: { api: api(CON_PROPUESTAS) },
};

export const ConEvidencia: Story = {
  name: "Con propuestas (evidencia abierta)",
  render: () => <AprenderDeEdiciones {...agregar} />,
  parameters: { api: api(CON_PROPUESTAS) },
  play: async ({ canvas, userEvent }) => {
    const [primera] = await canvas.findAllByRole("button", { name: "Ver evidencia" });
    if (primera) await userEvent.click(primera);
  },
};

export const SinPatron: Story = {
  name: "Sin propuestas todavía",
  render: () => <AprenderDeEdiciones {...agregar} />,
  parameters: { api: api({ aprender: true, edicionesParaRevisar: 3, propuestas: [] }) },
};

export const PocasEdiciones: Story = {
  name: "Menos de 2 ediciones (no puede revisar)",
  render: () => <AprenderDeEdiciones {...agregar} />,
  parameters: { api: api({ aprender: true, edicionesParaRevisar: 1, propuestas: [] }) },
};

export const Apagado: Story = {
  render: () => <AprenderDeEdiciones {...agregar} />,
  parameters: { api: api({ aprender: false, edicionesParaRevisar: 0, propuestas: [] }) },
};

/** «Revisar mis ediciones» con el modelo tardando: la respuesta nunca llega. */
export const Revisando: Story = {
  name: "Revisando mis ediciones",
  render: () => <AprenderDeEdiciones {...agregar} />,
  parameters: { api: api({ aprender: true, edicionesParaRevisar: 5, propuestas: [] }) },
  beforeEach: () => {
    const real = window.fetch;
    window.fetch = (input, init) =>
      (input instanceof Request ? input.url : input.toString()).includes("/revisar-ediciones")
        ? new Promise(() => undefined)
        : real(input, init);
    return () => {
      window.fetch = real;
    };
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /Revisar mis ediciones/ }));
  },
};

/** Lo que encontró la IA: un cambio de palabra que las reglas no ven. */
export const RevisionConPropuesta: Story = {
  name: "Revisión con IA (propuesta)",
  render: () => <AprenderDeEdiciones {...agregar} />,
  parameters: {
    api: api(
      { aprender: true, edicionesParaRevisar: 5, propuestas: [] },
      {
        "/api/brand-voice/revisar-ediciones": {
          body: {
            propuestas: [
              {
                id: "ia-1",
                origen: "ia",
                mensaje: "Cambiaste «chido» por «padre» en 2 publicaciones.",
                rasgo: "Dice «padre», nunca «chido»",
                evidencia: [
                  {
                    antes: "Qué chido es automatizar lo aburrido",
                    despues: "Qué padre es automatizar lo aburrido",
                  },
                ],
              },
            ],
          },
        },
      },
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /Revisar mis ediciones/ }));
  },
};

export const RevisionSinPatron: Story = {
  name: "Revisión con IA (sin patrón)",
  render: () => <AprenderDeEdiciones {...agregar} />,
  parameters: {
    api: api(
      { aprender: true, edicionesParaRevisar: 5, propuestas: [] },
      { "/api/brand-voice/revisar-ediciones": { body: { propuestas: [] } } },
    ),
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: /Revisar mis ediciones/ }));
  },
};

/** Ya tiene 8 rasgos: "Agregar" no cabe y lo dice. */
export const SinLugar: Story = {
  name: "Agregar sin lugar (8 de 8)",
  render: () => <AprenderDeEdiciones onAgregar={fn(() => Promise.resolve("lleno" as const))} />,
  parameters: { api: api(CON_PROPUESTAS) },
  play: async ({ canvas, userEvent }) => {
    const [primera] = await canvas.findAllByRole("button", { name: "Agregar" });
    if (primera) await userEvent.click(primera);
  },
};

/** El autoguardado de «Así escribes» falló: la propuesta se queda y lo dice. */
export const AgregarFallo: Story = {
  name: "Agregar (no se pudo guardar)",
  render: () => <AprenderDeEdiciones onAgregar={fn(() => Promise.resolve("error" as const))} />,
  parameters: { api: api(CON_PROPUESTAS) },
  play: async ({ canvas, userEvent }) => {
    const [primera] = await canvas.findAllByRole("button", { name: "Agregar" });
    if (primera) await userEvent.click(primera);
  },
};

export const ErrorDeCarga: Story = {
  name: "No se pudieron cargar",
  render: () => <AprenderDeEdiciones {...agregar} />,
  parameters: {
    api: {
      "/api/brand-voice/propuestas": {
        status: 503,
        body: { statusCode: 503, message: "Sin servicio" },
      },
    },
  },
};
