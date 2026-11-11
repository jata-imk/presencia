import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import type { ProfileDto } from "@presencia/shared";
import { AsiEscribes } from "./AsiEscribes.js";
import { MemoriaSeccion } from "./MemoriaSeccion.js";
import { UltimoEjemplo } from "./UltimoEjemplo.js";

// Las piezas nuevas de Configuración › Voz de marca (F12.5, Claude Design
// "Voz de marca v3"): «Así escribes», el último ejemplo en línea y la memoria.

const meta = {
  title: "Configuración/Voz de marca v3",
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

const RASGOS = [
  "Hablas de tú a tú, como con un amigo que sabe del tema",
  "Frases cortas. Una idea por línea",
  "Abres con una pregunta o un dato que pica",
  "Usas «neta» y «va que va» con medida",
  "Cierras invitando a guardar la publicación",
  "Nunca: «¡Hola, familia!»",
];

function AsiEscribesVivo({ inicial }: { inicial: string[] }) {
  const [rasgos, setRasgos] = useState(inicial);
  return <AsiEscribes rasgos={rasgos} onCambiar={setRasgos} estado={undefined} />;
}

export const AsiEscribesCompleto: Story = {
  name: "Así escribes",
  render: () => <AsiEscribesVivo inicial={RASGOS} />,
};

export const AsiEscribesVacio: Story = {
  name: "Así escribes (recién del onboarding, sin muestras)",
  render: () => <AsiEscribesVivo inicial={[]} />,
};

export const AsiEscribesLleno: Story = {
  name: "Así escribes (8 de 8, ya no agrega)",
  render: () => (
    <AsiEscribesVivo inicial={[...RASGOS, "Sin emojis ni hashtags", "Tuteas siempre"]} />
  ),
};

const EJEMPLO = {
  text: "¿Sigues planeando tu semana a mano?\n\nYo también lo hacía. Perdía el domingo entero acomodando ideas en una libreta.\n\nHoy le dicto mis temas a la IA en 10 minutos y el resto del día es mío. Neta.\n\nGuárdalo pa' después.",
  generatedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
};

const ultimo = { antesDePedir: () => Promise.resolve(true), onNuevo: fn() };

export const UltimoEjemploGuardado: Story = {
  name: "Último ejemplo",
  render: () => <UltimoEjemplo {...ultimo} ultimo={EJEMPLO} vozCambio={false} />,
};

export const UltimoEjemploVozCambio: Story = {
  name: "Último ejemplo (tu voz cambió desde él)",
  render: () => <UltimoEjemplo {...ultimo} ultimo={EJEMPLO} vozCambio />,
};

export const UltimoEjemploSinEjemplo: Story = {
  name: "Sin ejemplo todavía",
  render: () => <UltimoEjemplo {...ultimo} ultimo={null} vozCambio={false} />,
};

const yo = (memoryEnabled: boolean): ProfileDto => ({
  id: "usuario-demo",
  name: "Dev Presencia",
  email: "dev@presencia.local",
  displayName: "Dev Presencia",
  timezone: "America/Merida",
  onboardingCompletedAt: "2026-11-01T00:00:00.000Z",
  memoryEnabled,
});

export const MemoriaPrendida: Story = {
  name: "Memoria prendida",
  render: () => <MemoriaSeccion />,
  parameters: { api: { "/api/me": { body: yo(true) } } },
};

export const MemoriaApagada: Story = {
  name: "Memoria apagada",
  render: () => <MemoriaSeccion />,
  parameters: { api: { "/api/me": { body: yo(false) } } },
};

/** La confirmación de borrar: no se deshace, por eso pregunta. */
export const MemoriaConfirmarBorrar: Story = {
  name: "Confirmar borrar memoria",
  render: () => <MemoriaSeccion />,
  parameters: { api: { "/api/me": { body: yo(true) } } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: /Borrar todo lo que recuerdo/ }),
    );
  },
};
