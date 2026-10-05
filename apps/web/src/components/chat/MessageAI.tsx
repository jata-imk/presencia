import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock.js";
import { TypingDots } from "./TypingDots.js";

// Texto de Presencia (F10.5, Chat Rediseño.html → AIMsg): sin burbuja ni
// avatar, como un documento que se lee a 700 px. La burbuja se queda solo
// para lo que escribe el usuario (MessageUser), que es lo que distingue
// quién habla. Las acciones (copiar, regenerar) ya no viven aquí sino al pie
// del mensaje completo (AssistantMessage): un mensaje puede traer varios
// bloques de texto entre sus cards y copiarlos por separado no servía.
//
// F10.6.2: GFM (tablas, URLs sueltas como links, tachado, listas de tareas)
// y nada que desborde el ancho del chat: el código va en su bloque con
// scroll propio, las tablas en un contenedor con scroll, y los links abren
// en otra pestaña (el chat no se pierde) y se cortan si son muy largos.
const COMPONENTS: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="markdown-table">
      <table>{children}</table>
    </div>
  ),
};

const REMARK_PLUGINS = [remarkGfm];

export function MessageAI({ text, streaming }: { text: string; streaming: boolean }) {
  if (streaming && !text) return <TypingDots />;
  return (
    <div className="markdown min-w-0 text-[15px] leading-[1.68] text-fg">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
      {streaming && (
        <span
          className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-[3px] bg-pink-orchid"
          style={{ animation: "stream-cursor 900ms step-end infinite" }}
        />
      )}
    </div>
  );
}
