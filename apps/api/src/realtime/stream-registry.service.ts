import { Injectable, type OnModuleDestroy } from "@nestjs/common";

/** Lo que el registro necesita de una respuesta HTTP abierta. `express.Response` lo cumple. */
export interface StreamClient {
  write(chunk: string): boolean;
  end(): void;
}

/**
 * Cada cuánto se manda `event: ping` a todas las conexiones. Cumple dos
 * funciones:
 * - Mantener viva la conexión por debajo del timeout de lectura del proxy: el
 *   nginx de CloudPanel corta a los 900 s una conexión que no manda nada, y un
 *   stream de eventos de cards puede pasar horas callado.
 * - Que el navegador pueda notar una conexión medio abierta (laptop dormida,
 *   un proxy que no propaga el cierre): si deja de recibir pings, reconecta.
 *   Por eso es un evento con nombre y no un comentario SSE (`: ping`), que
 *   `EventSource` descarta sin avisarle a JavaScript.
 */
export const HEARTBEAT_MS = 20_000;

// Conexiones SSE abiertas en ESTE proceso, por usuario (F8.6). Vive en
// memoria: con una sola API no hace falta más (sin Redis ni pub/sub, ver
// no-objetivos de F8.6). Un usuario puede tener varias — pestañas, laptop y
// celular — y todas reciben lo mismo.
@Injectable()
export class StreamRegistry implements OnModuleDestroy {
  private readonly clients = new Map<string, Set<StreamClient>>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor() {
    // Un solo intervalo para todas las conexiones, no uno por conexión.
    this.heartbeat = setInterval(() => this.writeAll(formatEvent("ping", {})), HEARTBEAT_MS);
    // No mantiene vivo al proceso por sí solo (tests, apagado).
    this.heartbeat.unref();
  }

  add(userId: string, client: StreamClient): void {
    const set = this.clients.get(userId) ?? new Set<StreamClient>();
    set.add(client);
    this.clients.set(userId, set);
  }

  /**
   * Quita la conexión y, si era la última del usuario, también la clave. Sin
   * esto cada usuario que alguna vez abrió la app dejaría un Set vacío para
   * siempre.
   */
  remove(userId: string, client: StreamClient): void {
    const set = this.clients.get(userId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) this.clients.delete(userId);
  }

  has(userId: string): boolean {
    return this.clients.has(userId);
  }

  /** Cuántas conexiones hay abiertas en total. Para tests y diagnóstico. */
  size(): number {
    let total = 0;
    for (const set of this.clients.values()) total += set.size;
    return total;
  }

  send(userId: string, event: string, data: unknown): void {
    const set = this.clients.get(userId);
    if (!set) return;
    const chunk = formatEvent(event, data);
    for (const client of set) client.write(chunk);
  }

  /** A todas las conexiones de todos los usuarios. */
  broadcast(event: string, data: unknown = {}): void {
    this.writeAll(formatEvent(event, data));
  }

  onModuleDestroy(): void {
    clearInterval(this.heartbeat);
    for (const set of this.clients.values()) {
      for (const client of set) client.end();
    }
    this.clients.clear();
  }

  private writeAll(chunk: string): void {
    for (const set of this.clients.values()) {
      for (const client of set) client.write(chunk);
    }
  }
}

/**
 * Un evento SSE. `data` va en una sola línea: `JSON.stringify` no emite
 * saltos de línea, y uno crudo partiría el evento en dos.
 */
export function formatEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
