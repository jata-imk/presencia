import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { fn } from "storybook/test";
import { DATOS_INICIALES, type DatosOnboarding } from "../../lib/onboarding.js";
import { AuthShell } from "../auth/AuthShell.js";
import { PasoEscribes } from "./PasoEscribes.js";
import { PasoHablas } from "./PasoHablas.js";
import { PasoMetas } from "./PasoMetas.js";
import { PasoRedes } from "./PasoRedes.js";
import { PasoSuenas, type PasoSuenasProps } from "./PasoSuenas.js";
import { Stepper } from "./Piezas.js";

// El onboarding de F12.5 (Claude Design "Onboarding v2"), paso por paso. Los
// estados del cierre que en la app solo se ven en vivo —leyendo, error de
// lectura, rasgos cambiados, reescribiendo— viven aquí (ADR-027).

function Marco({ paso, children }: { paso: number; children: ReactNode }) {
  return (
    <AuthShell tarjeta="max-w-[480px] min-[521px]:min-h-[640px]">
      <Stepper paso={paso} />
      <div className="flex flex-1 flex-col gap-5">{children}</div>
    </AuthShell>
  );
}

/** Los pasos de datos, con su estado de verdad para poder escribir en ellos. */
function ConDatos({
  inicial,
  children,
}: {
  inicial: Partial<DatosOnboarding>;
  children: (datos: DatosOnboarding, cambiar: (c: Partial<DatosOnboarding>) => void) => ReactNode;
}) {
  const [datos, setDatos] = useState<DatosOnboarding>({ ...DATOS_INICIALES, ...inicial });
  return <>{children(datos, (c) => setDatos((d) => ({ ...d, ...c })))}</>;
}

const meta = {
  title: "Onboarding/Pasos",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hablas: Story = {
  name: "1 · ¿Cómo hablas?",
  render: () => (
    <Marco paso={0}>
      <ConDatos inicial={{ zona: "Sureste", ciudad: "Mérida", nichos: ["Comida"] }}>
        {(datos, cambiar) => (
          <PasoHablas
            datos={datos}
            onCambiar={cambiar}
            onSiguiente={fn()}
            guardando={false}
            error={null}
          />
        )}
      </ConDatos>
    </Marco>
  ),
};

export const HablasVacio: Story = {
  name: "1 · ¿Cómo hablas? (sin nicho)",
  render: () => (
    <Marco paso={0}>
      <ConDatos inicial={{}}>
        {(datos, cambiar) => (
          <PasoHablas
            datos={datos}
            onCambiar={cambiar}
            onSiguiente={fn()}
            guardando={false}
            error={null}
          />
        )}
      </ConDatos>
    </Marco>
  ),
};

const MUESTRAS = [
  "Hoy no les traigo receta, les traigo confesión: llevo tres semanas comiendo el mismo chilaquil y no me arrepiento. Salsa verde, totopo grueso, crema y ya. ¿Ustedes de qué equipo son, verdes o rojos?",
  "Si tu salsa sabe a nada, el problema es el tomate. Así de simple. Ásalo hasta que se ponga negrito y luego me cuentas.",
];

export const Escribes: Story = {
  name: "2 · ¿Cómo escribes?",
  render: () => (
    <Marco paso={1}>
      <ConDatos inicial={{ muestras: MUESTRAS, nunca: "«¡Hola, familia!», «foodie»" }}>
        {(datos, cambiar) => (
          <PasoEscribes
            datos={datos}
            onCambiar={cambiar}
            onSiguiente={fn()}
            onSinMuestras={fn()}
            onAtras={fn()}
          />
        )}
      </ConDatos>
    </Marco>
  ),
};

export const EscribesMuestraCorta: Story = {
  name: "2 · ¿Cómo escribes? (una muy corta)",
  render: () => (
    <Marco paso={1}>
      <ConDatos inicial={{ muestras: [MUESTRAS[0] ?? "", "Hola a todos"] }}>
        {(datos, cambiar) => (
          <PasoEscribes
            datos={datos}
            onCambiar={cambiar}
            onSiguiente={fn()}
            onSinMuestras={fn()}
            onAtras={fn()}
          />
        )}
      </ConDatos>
    </Marco>
  ),
};

const redes = {
  mensaje: null,
  ocupado: false,
  onConectar: fn(),
  onConfirmar: fn(),
  onCancelar: fn(),
  onSiguiente: fn(),
  onAtras: fn(),
};

export const RedesEsperando: Story = {
  name: "3 · ¿Dónde publicas? (esperando)",
  render: () => (
    <Marco paso={2}>
      <PasoRedes {...redes} conectadas={new Set()} esperando="instagram" />
    </Marco>
  ),
};

export const RedesConectada: Story = {
  name: "3 · ¿Dónde publicas? (conectada)",
  render: () => (
    <Marco paso={2}>
      <PasoRedes {...redes} conectadas={new Set(["instagram"])} esperando={null} />
    </Marco>
  ),
};

export const RedesSinDetectar: Story = {
  name: "3 · ¿Dónde publicas? (no detectó la cuenta)",
  render: () => (
    <Marco paso={2}>
      <PasoRedes
        {...redes}
        conectadas={new Set()}
        esperando="tiktok"
        mensaje="No detectamos ninguna cuenta nueva todavía. Termina de conectar tu red en la otra pestaña y vuelve a intentar."
      />
    </Marco>
  ),
};

export const Metas: Story = {
  name: "4 · ¿Qué buscas?",
  render: () => (
    <Marco paso={3}>
      <ConDatos inicial={{ metas: ["crecer", "tiempo"] }}>
        {(datos, cambiar) => (
          <PasoMetas
            datos={datos}
            onCambiar={cambiar}
            onSiguiente={fn()}
            onSaltar={fn()}
            onAtras={fn()}
            guardando={false}
            error={null}
          />
        )}
      </ConDatos>
    </Marco>
  ),
};

const RASGOS = [
  "Frases cortas y directas",
  "Abres con una confesión",
  "Le hablas a «ustedes»",
  "Cierras con una pregunta",
  "Nunca: «¡Hola, familia!»",
];
const POST =
  "Confesión del día: no mido nada cuando cocino. Ni el chile, ni la sal, ni el ajo.\n\nMi abuela tampoco medía y nadie se quejó nunca.\n\nEl truco es probar. Pruebas, ajustas, vuelves a probar. Si te pasaste de sal, tortilla extra y listo.\n\n¿Ustedes son de receta exacta o de «al ojo»?";

const suenas: PasoSuenasProps = {
  fase: "listo",
  sinMuestras: false,
  rasgos: RASGOS,
  rasgosCambiados: false,
  post: POST,
  red: "instagram",
  regenerando: false,
  terminando: false,
  onCambiarRasgos: fn(),
  onAjustar: fn(),
  onReintentar: fn(),
  onSeguirSin: fn(),
  onTerminar: fn(),
  onAtras: fn(),
};

/** El cierre con sus rasgos editables de verdad: quitar o editar uno prende «Ajustar». */
function SuenasVivo(props: Partial<PasoSuenasProps>) {
  const [rasgos, setRasgos] = useState(props.rasgos ?? RASGOS);
  return (
    <Marco paso={4}>
      <PasoSuenas
        {...suenas}
        {...props}
        rasgos={rasgos}
        rasgosCambiados={JSON.stringify(rasgos) !== JSON.stringify(props.rasgos ?? RASGOS)}
        onCambiarRasgos={setRasgos}
      />
    </Marco>
  );
}

export const SuenasListo: Story = { name: "5 · Así suenas", render: () => <SuenasVivo /> };

export const SuenasRasgosCambiados: Story = {
  name: "5 · Así suenas (rasgos cambiados, pide «Ajustar»)",
  render: () => (
    <Marco paso={4}>
      <PasoSuenas {...suenas} rasgos={RASGOS.slice(0, 3)} rasgosCambiados />
    </Marco>
  ),
};

export const SuenasLeyendo: Story = {
  name: "5 · Así suenas (leyendo)",
  render: () => <SuenasVivo fase="cargando" />,
};

export const SuenasSinMuestras: Story = {
  name: "5 · Así suenas (sin muestras)",
  render: () => <SuenasVivo sinMuestras rasgos={[]} red={null} />,
};

export const SuenasSinMuestrasLeyendo: Story = {
  name: "5 · Así suenas (sin muestras, escribiendo)",
  render: () => <SuenasVivo sinMuestras fase="cargando" />,
};

export const SuenasReescribiendo: Story = {
  name: "5 · Así suenas (reescribiendo con «Ajustar»)",
  render: () => <SuenasVivo regenerando />,
};

export const SuenasErrorDeLectura: Story = {
  name: "5 · Así suenas (no pudo leer)",
  render: () => <SuenasVivo fase="error-lectura" />,
};

export const SuenasErrorDelPost: Story = {
  name: "5 · Así suenas (no pudo escribir el post)",
  render: () => <SuenasVivo fase="error-post" />,
};
