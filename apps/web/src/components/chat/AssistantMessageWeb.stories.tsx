import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import type { ChatUIMessage } from "../../lib/chat-types.js";
import { card, cardPart, cardPartNaciendo, CONTENIDO } from "../../stories/fixtures/cards.js";
import {
  busqueda,
  buscando,
  lectura,
  leyendo,
  PAGINAS,
  RESPUESTA_CAFE,
  texto,
} from "../../stories/fixtures/web.js";
import { AssistantMessage } from "./AssistantMessage.js";

// F10.10 (Chat Web.html): una respuesta que busca y lee en la web. La línea
// de pasos va arriba (una sola lista con la web y los borradores), la lista
// de fuentes abajo. Los nombres de las historias son los del diseño.

function respuesta(parts: unknown[]): ChatUIMessage {
  return { id: "respuesta-web", role: "assistant", parts } as ChatUIMessage;
}

const CAFE = "precio del café en Mérida";
const IG = "card-ig";

const meta = {
  title: "Chat/Respuesta con búsqueda web",
  component: AssistantMessage,
  args: {
    message: respuesta([]),
    chatId: "chat-demo",
    isLast: true,
    streamingNow: false,
    canRegenerate: true,
    onRegenerate: fn(),
  },
  parameters: { cards: [card(IG)] },
  decorators: [
    (Story) => (
      <div className="max-w-[700px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AssistantMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Arranca la herramienta: la línea aparece antes que el texto. */
export const Buscando: Story = {
  args: { message: respuesta([buscando(CAFE)]), streamingNow: true, canRegenerate: false },
};

/** Solo el dominio, sin www. */
export const Leyendo: Story = {
  args: {
    message: respuesta([leyendo(PAGINAS.pe.url)]),
    streamingNow: true,
    canRegenerate: false,
  },
};

/** Con más de un paso, la lista se abre en vivo. */
export const BuscaYLee: Story = {
  name: "Busca y lee",
  args: {
    message: respuesta([
      busqueda(CAFE, [PAGINAS.dy, PAGINAS.pe, PAGINAS.md]),
      lectura(PAGINAS.dy.url, { titulo: PAGINAS.dy.titulo }),
      leyendo(PAGINAS.pe.url),
    ]),
    streamingNow: true,
    canRegenerate: false,
  },
};

/** Al terminar se pliega en un resumen; la evidencia vive en Fuentes, abajo. */
export const Terminado: Story = {
  args: {
    message: respuesta([
      busqueda(CAFE, [PAGINAS.dy, PAGINAS.pe, PAGINAS.md]),
      lectura(PAGINAS.dy.url, { titulo: PAGINAS.dy.titulo }),
      lectura(PAGINAS.pe.url, { titulo: PAGINAS.pe.titulo }),
      RESPUESTA_CAFE,
    ]),
  },
};

/** Tres fuentes: la lista va abierta. El fragmento aparece al pasar el mouse. */
export const Fuentes: Story = {
  args: {
    message: respuesta([
      busqueda(CAFE, [PAGINAS.dy, PAGINAS.pe, PAGINAS.md]),
      lectura(PAGINAS.dy.url, { titulo: PAGINAS.dy.titulo }),
      lectura(PAGINAS.pe.url, { titulo: PAGINAS.pe.titulo }),
      texto(
        `${RESPUESTA_CAFE.text}\n\nTambién hay una ruta del café por la ciudad ([México Desconocido](${PAGINAS.md.url})).`,
      ),
    ]),
  },
};

/** Más de 3: se pliega a una fila con las iniciales de los dominios. */
export const FuentesPlegadas: Story = {
  name: "Fuentes plegadas",
  args: {
    message: respuesta([
      busqueda(CAFE, [PAGINAS.dy, PAGINAS.pe, PAGINAS.md]),
      busqueda("cafeterías independientes Mérida", [PAGINAS.lv, PAGINAS.yu]),
      lectura(PAGINAS.dy.url, { titulo: PAGINAS.dy.titulo }),
      lectura(PAGINAS.pe.url, { titulo: PAGINAS.pe.titulo }),
      lectura(PAGINAS.yu.url, { titulo: PAGINAS.yu.titulo }),
      texto(
        `Encontré precios bastante parejos en cinco medios: un americano en el Centro va de 45 a 60 pesos ([Diario de Yucatán](${PAGINAS.dy.url})) y las cafeterías independientes compiten con métodos de especialidad arriba de 70 ([Yucatán.com.mx](${PAGINAS.yu.url})), según [México Desconocido](${PAGINAS.md.url}) y [La Verdad](${PAGINAS.lv.url}).\n\n¿Quieres que lo convierta en un carrusel de 5 slides?`,
      ),
    ]),
  },
};

/** Sin rojo ni alarma: la línea dice el motivo y el modelo pide el contenido. */
export const NoSePudoLeer: Story = {
  name: "No se pudo leer",
  args: {
    message: respuesta([
      lectura("https://www.instagram.com/reel/C9xQ2mLp7aT/", { estado: "requiere_sesion" }),
      texto(
        "No puedo abrir publicaciones de Instagram porque piden iniciar sesión. Si me pegas aquí el texto del reel o una captura, lo adapto a tu estilo.",
      ),
    ]),
  },
};

/** Al llegar al tope, la lista dice qué quedó fuera. */
export const Limite: Story = {
  name: "Límite",
  args: {
    message: respuesta([
      lectura(PAGINAS.dy.url, { titulo: PAGINAS.dy.titulo }),
      lectura(PAGINAS.pe.url, { titulo: PAGINAS.pe.titulo }),
      lectura(PAGINAS.lv.url, { titulo: PAGINAS.lv.titulo }),
      lectura("https://www.milenio.com/estados/yucatan/cafe", { estado: "limite" }),
      texto(
        "Leí tres de las cuatro notas; mi tope es 3 páginas por mensaje. Las tres coinciden en que el precio subió este año. Si quieres que incluya la de Milenio, mándamela en otro mensaje.",
      ),
    ]),
  },
};

/** Lo que ya se leyó se conserva como fuente. */
export const Detenido: Story = {
  args: {
    message: respuesta([
      busqueda(CAFE, [PAGINAS.dy, PAGINAS.pe]),
      lectura(PAGINAS.dy.url, { titulo: PAGINAS.dy.titulo }),
      leyendo(PAGINAS.pe.url),
    ]),
    streamingNow: false,
  },
};

/** Marca sutil en la fuente, con tooltip que explica. */
export const LecturaParcial: Story = {
  name: "Lectura parcial",
  args: {
    message: respuesta([
      lectura("https://www.inegi.org.mx/app/mapa/denue/", {
        titulo: "Directorio Estadístico Nacional de Unidades Económicas",
        truncado: true,
      }),
      lectura("https://www.gob.mx/agricultura/acciones-y-programas/cafe-2026", {
        titulo: "Programa de apoyo a productores de café 2026",
        soloDescripcion: true,
      }),
      texto(
        "El directorio del INEGI registra varios cientos de cafeterías en el municipio; como la página es muy larga, solo leí el inicio, así que el número exacto puede variar. Del programa de gob.mx solo pude leer la descripción.",
      ),
    ]),
  },
};

/** Una sola lista: buscar, leer y crear el borrador, en orden (Jose, 2026-10-28). */
export const BuscaLeeYCrea: Story = {
  name: "Busca, lee y crea un borrador",
  args: {
    message: respuesta([
      busqueda(CAFE, [PAGINAS.dy, PAGINAS.pe]),
      lectura(PAGINAS.dy.url, { titulo: PAGINAS.dy.titulo }),
      texto("Con eso te preparé el carrusel:"),
      cardPart(IG, "instagram", CONTENIDO.instagram),
    ]),
  },
};

/** Lo mismo, mientras el borrador todavía nace. */
export const BuscaLeeYCreaEnVivo: Story = {
  name: "Busca, lee y crea (en vivo)",
  args: {
    message: respuesta([
      busqueda(CAFE, [PAGINAS.dy, PAGINAS.pe]),
      lectura(PAGINAS.dy.url, { titulo: PAGINAS.dy.titulo }),
      cardPartNaciendo("instagram"),
    ]),
    streamingNow: true,
    canRegenerate: false,
  },
};
