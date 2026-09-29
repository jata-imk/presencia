import ReactMarkdown from "react-markdown";
import { TypingDots } from "./TypingDots.js";

// Texto de Presencia (F10.5, Chat Rediseño.html → AIMsg): sin burbuja ni
// avatar, como un documento que se lee a 700 px. La burbuja se queda solo
// para lo que escribe el usuario (MessageUser), que es lo que distingue
// quién habla. Las acciones (copiar, regenerar) ya no viven aquí sino al pie
// del mensaje completo (AssistantMessage): un mensaje puede traer varios
// bloques de texto entre sus cards y copiarlos por separado no servía.
export function MessageAI({ text, streaming }: { text: string; streaming: boolean }) {
  if (streaming && !text) return <TypingDots />;
  return (
    <div className="markdown text-[15px] leading-[1.68] text-fg">
      <ReactMarkdown>{text}</ReactMarkdown>
      {streaming && (
        <span
          className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-[3px] bg-pink-orchid"
          style={{ animation: "stream-cursor 900ms step-end infinite" }}
        />
      )}
    </div>
  );
}
