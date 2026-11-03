import { Injectable } from "@nestjs/common";

// Avisos en proceso de lo que le pasa a un chat (F11 PR4, ADR-030), para los
// canales: el título nuevo de un chat renombra su tema de Telegram. En memoria
// y en el mismo proceso, igual que el turno: el título se escribe en el
// proceso `app`, donde también vive el bot. Las pestañas web se enteran por
// otro camino (NOTIFY `chat_changed`, F8.6).

export interface ChatTitled {
  userId: string;
  chatId: string;
  title: string;
  /** `auto`: el título automático; `user`: el creator lo renombró en la web. */
  source: "auto" | "user";
}

type Listener = (event: ChatTitled) => void | Promise<void>;

@Injectable()
export class ChatEvents {
  private readonly titledListeners = new Set<Listener>();

  /** Escucha los títulos nuevos. Devuelve cómo dejar de escuchar. */
  onTitled(listener: Listener): () => void {
    this.titledListeners.add(listener);
    return () => this.titledListeners.delete(listener);
  }

  /** Ya guardado (después del commit). Nunca lanza: un canal que falla no le cuesta nada al título. */
  titled(event: ChatTitled): void {
    for (const listener of this.titledListeners) {
      void Promise.resolve()
        .then(() => listener(event))
        .catch((error: unknown) => {
          console.error(`[chat] Un aviso de título nuevo falló (chat ${event.chatId}):`, error);
        });
    }
  }
}
