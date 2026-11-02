import type { ServerResponse } from "node:http";
import type { UIMessage, UIMessageChunk, UIMessageStreamOptions } from "ai";

// A dónde va un turno del chat (F11, ADR-030 y addendum de ADR-006).
//
// El turno (cuota, contexto, modelos con respaldo, tools, guardar, cobrar,
// traza) es uno solo para todos los canales. Lo que cambia por canal es quién
// lo recibe: la web lo lee como un stream SSE y "detiene" cerrando la conexión;
// Telegram (F11) lo pintará como draft y mensajes, y detiene con su botón.
// Este contrato es la costura: el turno solo habla con un `TurnSink`.
//
// Las tres preguntas que el turno le hace al que recibe son las que antes le
// hacía al `ServerResponse` (`destroyed`, `writableFinished` y el evento
// "close"), con la misma semántica, para que el turno web no cambie en nada.

/** Lo que un sink necesita del resultado de `streamText`: las dos formas de leerlo. */
export interface TurnStream {
  pipeUIMessageStreamToResponse(
    response: ServerResponse,
    options?: UIMessageStreamOptions<UIMessage>,
  ): Promise<void>;
  toUIMessageStream(options?: UIMessageStreamOptions<UIMessage>): AsyncIterable<UIMessageChunk>;
}

export interface TurnSink {
  /** El que recibe ya se fue (web: la conexión está cerrada o destruida). */
  readonly gone: boolean;
  /** Ya recibió la respuesta entera (web: el stream terminó de escribirse). */
  readonly delivered: boolean;
  /**
   * Se registra una vez, al empezar el turno, y avisa cuando el que recibe se
   * va (web: "close" de la conexión). Si ya se había ido, no se vuelve a
   * llamar: el turno lo revisa con `gone`.
   */
  onGone(listener: () => void): void;
  /**
   * Entrega el turno. Tiene que correr `options.onEnd` una sola vez, también
   * si el que recibe se va a la mitad, como el pipe del AI SDK: ahí se guarda
   * y se cobra. Un rechazo de la promesa es un fallo de la entrega, no del
   * turno.
   */
  deliver(stream: TurnStream, options: UIMessageStreamOptions<UIMessage>): Promise<void>;
}

/** El canal web: el stream SSE de `POST /chats/:id/stream` (ADR-006). */
export class WebTurnSink implements TurnSink {
  constructor(private readonly res: ServerResponse) {}

  get gone(): boolean {
    return this.res.destroyed;
  }

  get delivered(): boolean {
    return this.res.writableFinished;
  }

  onGone(listener: () => void): void {
    this.res.once("close", listener);
  }

  deliver(stream: TurnStream, options: UIMessageStreamOptions<UIMessage>): Promise<void> {
    return stream.pipeUIMessageStreamToResponse(this.res, options);
  }
}
