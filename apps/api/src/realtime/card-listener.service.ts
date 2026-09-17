import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import pg from "pg";
import { CardsService } from "../cards/cards.service.js";
import { env } from "../env.js";
import { CARD_CHANGED_CHANNEL, decodeCardChanged, type CardChanged } from "./card-events.js";
import { StreamRegistry } from "./stream-registry.service.js";

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * El lado LISTEN del puente de cards (F8.6, addendum de ADR-006). Escucha el
 * canal que llenan las escrituras de cards.repository.ts —las de la API y las
 * del worker, que corre en otro contenedor— y empuja la card a las conexiones
 * SSE de su dueño.
 *
 * Una conexión DEDICADA y no una del pool: `LISTEN` vale mientras viva la
 * sesión, y el pool devuelve y reparte conexiones.
 */
@Injectable()
export class CardListener implements OnModuleInit, OnModuleDestroy {
  private client: pg.Client | null = null;
  private stopped = false;
  private connectedOnce = false;
  private reconnectDelay = RECONNECT_MIN_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  // Las notificaciones se atienden EN SERIE. Cada una lee la card de la base;
  // en paralelo, dos cambios seguidos de la misma card podrían resolver al
  // revés y dejar en pantalla el más viejo (el cliente tiene su guardia de
  // `updatedAt`, pero no hace falta ponerla a prueba).
  private queue: Promise<void> = Promise.resolve();

  constructor(
    @Inject(StreamRegistry) private readonly registry: StreamRegistry,
    @Inject(CardsService) private readonly cards: CardsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // `connect` no lanza: si la base no está disponible al arrancar, la API
    // levanta igual (el chat, el calendario) y el listener reintenta solo.
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.client?.end().catch(() => undefined);
    this.client = null;
  }

  /** Atiende una notificación. Público para los tests. */
  handle(payload: string | undefined): Promise<void> {
    const event = decodeCardChanged(payload);
    if (!event) {
      console.warn(
        `[realtime] notificación ignorada en ${CARD_CHANGED_CHANNEL}: ${String(payload)}`,
      );
      return this.queue;
    }
    this.queue = this.queue
      .then(() => this.dispatch(event))
      .catch((error: unknown) => {
        console.error(`[realtime] no se pudo despachar la card ${event.cardId}:`, error);
      });
    return this.queue;
  }

  private async dispatch({ userId, cardId }: CardChanged): Promise<void> {
    // Sin conexiones de ese usuario en este proceso no hay a quién avisar, y
    // leer la card sería un viaje a la base para nada.
    if (!this.registry.has(userId)) return;
    const card = await this.cards.findDto(userId, cardId);
    if (card) this.registry.send(userId, "card", card);
    else this.registry.send(userId, "card-deleted", { id: cardId });
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    const client = new pg.Client({
      connectionString: env.APP_DATABASE_URL,
      // Una conexión que pasa horas sin tráfico: sin keepalive de TCP, un
      // firewall o el túnel de dev la pueden matar en silencio y el LISTEN se
      // quedaría esperando notificaciones que ya no llegan.
      keepAlive: true,
      application_name: "presencia-card-listener",
    });
    client.on("notification", (message) => {
      if (message.channel === CARD_CHANGED_CHANNEL) void this.handle(message.payload);
    });
    client.on("error", (error) => {
      console.error("[realtime] se cayó la conexión del listener:", error.message);
      this.scheduleReconnect(client);
    });
    client.on("end", () => this.scheduleReconnect(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${CARD_CHANGED_CHANNEL}`);
    } catch (error) {
      console.error(
        "[realtime] no se pudo escuchar cambios de cards:",
        error instanceof Error ? error.message : error,
      );
      this.scheduleReconnect(client);
      return;
    }

    this.client = client;
    this.reconnectDelay = RECONNECT_MIN_MS;
    if (this.connectedOnce) {
      // NOTIFY no se encola: lo que se publicó mientras no había LISTEN se
      // perdió. Se le pide a cada navegador que vuelva a pedir lo que tiene en
      // pantalla, que es la red de seguridad del stream.
      this.registry.broadcast("resync");
      console.log("[realtime] listener reconectado; se pidió resync a los clientes");
    }
    this.connectedOnce = true;
  }

  private scheduleReconnect(client: pg.Client): void {
    // `error` y `end` suelen llegar los dos por la misma caída; y una conexión
    // vieja no debe programar nada si ya hay otra.
    if (this.stopped || this.reconnectTimer || (this.client && this.client !== client)) return;
    this.client = null;
    // Se sueltan los handlers (que no vuelva a programar nada), pero queda uno
    // de `error` que no hace nada: un error tardío de la conexión vieja sin
    // ningún handler tumbaría el proceso entero.
    client.removeAllListeners();
    client.on("error", () => undefined);
    client.end().catch(() => undefined);
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref();
  }
}
