import { Inject, Injectable } from "@nestjs/common";
import type { CardRow } from "../cards/cards.repository.js";
import { CardsRepository } from "../cards/cards.repository.js";
import { ChannelsRepository } from "../channels/channels.repository.js";
import { DbService } from "../db/db.service.js";
import { env } from "../env.js";
import { summarizeFailures } from "../jobs/summarize-failures.js";
import {
  PUBLISHING_PROVIDER,
  type PostMetricsQuery,
  type PublishingProvider,
} from "../publishing/publishing.provider.js";
import { barajar } from "./barajar.js";
import { bucketAMedir, EDAD_MAXIMA_DIAS } from "./frescura.js";
import { MetricsRepository } from "./metrics.repository.js";

// La ingesta de métricas (F8.7, ADR-021). Estructura de ADR-008: enumerar →
// iterar con try/catch por unidad → contar fallos → relanzar al final.
//
// El pase es GLOBAL por el mismo motivo que el de reconciliación: la llamada
// al proveedor va por API key, no por usuario, así que preguntar por usuario
// haría N veces el mismo trabajo. Las ESCRITURAS sí vuelven por tenant, que
// es donde el RLS decide la fila.

/** Margen sobre la ventana de la política: la policy es el techo, no el filtro fino. */
const VENTANA_BARRIDO_DIAS = EDAD_MAXIMA_DIAS + 5;

// Presupuesto de posts de TODO el pase, repartido entre los usuarios que
// tengan algo que medir.
//
// Tiene que vivir acá y no en el adapter, aunque el adapter también se
// proteja: su tope es por LLAMADA, y `getPostMetrics` se llama una vez por
// usuario (Upload-Post pregunta por perfil, no hay lote global del lado del
// proveedor). Con el tope solo allá, N usuarios harían N×60 requests contra
// una ventana de 100 cada 5 minutos — el pase se autoestrangularía y, peor,
// le quitaría la cuota a `cards.reconcile`, que usa la MISMA API key cada
// minuto y sí es de cara al usuario.
//
// 60 y no 100: la reconciliación necesita aire en esa misma ventana.
//
// Cuenta POSTS pedidos, que no es exactamente requests: en Upload-Post es 1:1
// salvo las redes que su endpoint no cubre (ahí deja fila sin preguntar), y en
// PostFast un lote entero cuesta una sola request. Las dos desviaciones van
// hacia el lado seguro — se mide de menos, nunca de más.
const POSTS_POR_PASE = 60;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Cuánto puede llevar un pase antes de darlo por perdido.
 *
 * Vive acá y lo importa el job (y no al revés) para que sea un solo número: es
 * el mismo techo que `expireInSeconds` le declara a pg-boss. Si los dos se
 * separaran, la guarda contra pases solapados y el expire de la cola estarían
 * midiendo cosas distintas y nadie lo notaría.
 */
export const INGEST_EXPIRE_SECONDS = 50 * 60;
const TECHO_DEL_PASE_MS = INGEST_EXPIRE_SECONDS * 1000;

export interface OpcionesDePase {
  /** Tope de posts de todo el pase. Default: POSTS_POR_PASE. */
  presupuesto?: number;
  /** Instante que fija los buckets. Default: ahora. Solo lo pasan los tests. */
  ahora?: Date;
}

@Injectable()
export class MetricsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CardsRepository) private readonly cardsRepo: CardsRepository,
    @Inject(ChannelsRepository) private readonly channelsRepo: ChannelsRepository,
    @Inject(MetricsRepository) private readonly repo: MetricsRepository,
    @Inject(PUBLISHING_PROVIDER) private readonly provider: PublishingProvider,
  ) {}

  /** Cuándo arrancó el pase en vuelo, o `null` si no hay ninguno. */
  private corriendoDesde: number | null = null;

  /**
   * Un pase completo: enumera lo publicado, filtra por frescura, le pregunta
   * al proveedor y guarda un snapshot por post y bucket.
   *
   * Un usuario que falla no tumba a los demás — se acumula y se relanza al
   * final, para que el job quede marcado como fallido en `pgboss.job` y el
   * error diga quiénes fueron (patrón de ADR-008).
   *
   * Las dos opciones son parámetros y no solo constantes para poder probar el
   * recorte sin fabricar 60 publicaciones, y la escalera sin esperar horas. El
   * job lo llama sin argumentos.
   */
  async ingestAll(opciones: OpcionesDePase = {}): Promise<void> {
    // Un pase a la vez en este proceso.
    //
    // El cron es horario y `expireInSeconds` son 50 minutos: diez de margen.
    // Al expirar, pg-boss marca el job `failed` CON EL HANDLER TODAVÍA
    // CORRIENDO, y como la policy `exclusive` solo cuenta los jobs en
    // `created`/`active`, el slot queda libre y el tick siguiente arranca un
    // segundo pase sobre los mismos datos — midiendo dos veces y gastando el
    // presupuesto dos veces.
    //
    // Una bandera en memoria alcanza porque ese segundo pase sale del MISMO
    // proceso worker. El día que corra más de un worker hará falta un lock en
    // la base; hoy prod es un solo contenedor y eso sería infra por si acaso.
    //
    // **Con fecha de caducidad, y eso no es opcional.** Una bandera pelada deja
    // la ingesta muerta para siempre si el pase nunca termina: la promesa no
    // resuelve, el `finally` no corre, y cada tick siguiente sale por el
    // `return` — que pg-boss registra como `completed`. O sea un job que se ve
    // sano mientras no mide nada, que es peor que el pase duplicado que esta
    // guarda evita. Y colgarse es alcanzable: el cliente HTTP tiene timeout,
    // pero una conexión del pool trabada no.
    const desdeCuando = this.corriendoDesde;
    if (desdeCuando !== null) {
      const corriendoHace = Date.now() - desdeCuando;
      if (corriendoHace < TECHO_DEL_PASE_MS) {
        // Se LANZA en vez de volver callado: una hora saltada es una anomalía y
        // tiene que quedar en `pgboss.job`, no solo en un console.warn que
        // nadie lee.
        throw new Error(
          `El pase anterior lleva ${String(Math.round(corriendoHace / 1000))} s corriendo; este tick se salta.`,
        );
      }
      console.error(
        `[metrics] El pase anterior lleva ${String(Math.round(corriendoHace / 60000))} min y pasó su techo: se lo da por perdido y se arranca otro.`,
      );
    }
    this.corriendoDesde = Date.now();
    try {
      await this.pase(opciones);
    } finally {
      this.corriendoDesde = null;
    }
  }

  private async pase(opciones: OpcionesDePase): Promise<void> {
    const presupuestoDelPase = opciones.presupuesto ?? POSTS_POR_PASE;
    // Un solo reloj para todo el pase. El bucket de cada post se decide con
    // ESTE instante y no con el `captured_at` de su respuesta: un pase largo
    // (hasta 60 requests secuenciales) puede cruzar el borde de la hora, y
    // entonces la fila quedaría llaveada al bucket siguiente. El pase del cron
    // siguiente vería ese bucket ya medido, lo saltaría, y el punto de esta
    // hora no existiría nunca — justo en el tramo que la escalera existe para
    // resolver.
    const ahora = opciones.ahora ?? new Date();
    const desde = new Date(ahora.getTime() - VENTANA_BARRIDO_DIAS * MS_POR_DIA);
    const cards = await this.dbService.runWorkerScan((tx) =>
      this.cardsRepo.listPublishedForMetrics(tx, desde),
    );
    if (cards.length === 0) return;

    const failed = new Set<string>();
    const porUsuario = groupByUser(cards);
    // Orden al azar, a propósito. `listPublishedForMetrics` no ordena y el
    // índice parcial la sirve siempre igual, así que con más usuarios con algo
    // que medir que presupuesto del pase, los del final de la lista se
    // quedarían sin medir SIEMPRE los mismos. Barajar no arregla que el
    // presupuesto no alcance —eso se arregla subiéndolo o pasando a un
    // proveedor que pregunte en lote— pero reparte el faltante en vez de
    // castigar a los mismos.
    //
    // Con Fisher-Yates y no con `sort(() => Math.random() - 0.5)`, que era lo
    // que había y NO baraja: ver `barajar`.
    const usuarios = barajar([...porUsuario.entries()]);
    let presupuesto = presupuestoDelPase;
    let usuariosRestantes = usuarios.length;
    for (const [userId, delUsuario] of usuarios) {
      // Reparto parejo de lo que queda. Sin esto, el primer usuario del mapa
      // se comería el presupuesto entero todos los pases y los demás no se
      // medirían nunca — y el orden del mapa no es una prioridad, es el orden
      // en que Postgres devolvió las filas.
      const cupo = Math.max(1, Math.ceil(presupuesto / usuariosRestantes));
      usuariosRestantes -= 1;
      if (presupuesto <= 0) {
        console.warn(
          `[metrics] Presupuesto del pase agotado; ${usuariosRestantes + 1} usuario(s) quedan para el siguiente.`,
        );
        break;
      }
      try {
        const medidos = await this.ingestForUser(userId, delUsuario, ahora, cupo);
        presupuesto -= medidos;
      } catch (error) {
        failed.add(userId);
        console.error(`[metrics] No se pudieron ingestar las métricas de ${userId}:`, error);
      }
    }
    if (failed.size > 0) throw new Error(summarizeFailures("La ingesta de métricas", [...failed]));
  }

  /** Devuelve cuántos posts consumió del presupuesto del pase. */
  private async ingestForUser(
    userId: string,
    cards: CardRow[],
    ahora: Date,
    cupo: number,
  ): Promise<number> {
    const porPost = new Map<string, CardRow>();
    for (const card of cards) {
      // La policy ya exige platform_post_id y published_at, pero el tipo de la
      // fila los declara nullable y este método también se puede llamar con
      // cards de otra procedencia. El narrowing es de verdad, no ceremonia.
      if (card.platformPostId && card.publishedAt) porPost.set(card.platformPostId, card);
    }
    if (porPost.size === 0) return 0;

    // Primero SOLO la pregunta barata: cuándo se midió cada post.
    const medidos = await this.dbService.runWithTenant(userId, (tx) =>
      this.repo.lastBuckets(tx, [...porPost.keys()]),
    );

    // Y acá decide la escalera. Para la mayoría de los usuarios en la mayoría
    // de los pases el trabajo se termina en esta línea, que es justo el punto:
    // el cron es horario pero un post viejo se mide cada catorce o treinta
    // días. Antes esta decisión venía DESPUÉS de buscar las cuentas, así que
    // todos los usuarios pagaban un `findAccountById` por cuenta —en serie—
    // para enterarse de que no había nada que medir. El comentario decía que
    // el cron horario no multiplicaba el gasto, y era cierto para la red y
    // falso para la base.
    const candidatos: {
      card: CardRow;
      platformPostId: string;
      publishedAt: Date;
      bucket: Date;
    }[] = [];
    for (const [platformPostId, card] of porPost) {
      const publishedAt = card.publishedAt;
      if (!publishedAt) continue;
      const bucket = bucketAMedir({
        publishedAt,
        ultimoBucket: medidos.get(platformPostId) ?? null,
        ahora,
      });
      if (bucket) candidatos.push({ card, platformPostId, publishedAt, bucket });
    }
    if (candidatos.length === 0) return 0;

    // Recién ahora las cuentas, y solo las de los candidatos.
    //
    // La cuenta hace falta porque el puerto pregunta por el `provider_ref` de
    // la CUENTA (el adapter lo parte en perfil y plataforma), que no es el
    // `provider_ref` de la card — ese identifica el envío. Y no puede venir
    // del barrido global: `social_accounts` no tiene policy de worker_scan,
    // así que un join ahí devolvería cero filas sin avisar.
    const refsDeCuenta = await this.dbService.runWithTenant(userId, async (tx) => {
      const refs = new Map<string, string>();
      const idsDeCuenta = new Set(
        candidatos.map(({ card }) => card.socialAccountId).filter((id) => id !== null),
      );
      for (const id of idsDeCuenta) {
        const cuenta = await this.channelsRepo.findAccountById(tx, id);
        if (cuenta) refs.set(id, cuenta.providerRef);
      }
      return refs;
    });

    const pedidos: PostMetricsQuery[] = [];
    // El bucket con el que se decidió medir es el mismo con el que se escribe.
    const bucketPorPost = new Map<string, Date>();
    for (const { card, platformPostId, publishedAt, bucket } of candidatos) {
      // Una card cuya cuenta se borró (SET NULL) no tiene por dónde
      // preguntar. Queda fuera del pase: no se inventa un destino, y sus
      // métricas viejas siguen en la tabla intactas.
      const accountProviderRef = card.socialAccountId
        ? refsDeCuenta.get(card.socialAccountId)
        : undefined;
      if (!accountProviderRef) continue;
      pedidos.push({
        accountProviderRef,
        network: card.network,
        platformPostId,
        publishedAt,
      });
      bucketPorPost.set(platformPostId, bucket);
    }
    if (pedidos.length === 0) return 0;

    // Prioridad ANTES de recortar por cupo, y este orden importa: la query no
    // ordena, así que el índice parcial la sirve por `published_at` — o sea
    // de la más vieja a la más nueva. Recortar ahí dejaría afuera siempre a
    // las recién publicadas, que son justo las del tramo de 48 h que la
    // política prioriza y cuya primera medición no se recupera después.
    pedidos.sort((a, b) => {
      const nuncaA = medidos.has(a.platformPostId) ? 1 : 0;
      const nuncaB = medidos.has(b.platformPostId) ? 1 : 0;
      if (nuncaA !== nuncaB) return nuncaA - nuncaB;
      return b.publishedAt.getTime() - a.publishedAt.getTime();
    });
    const delPase = pedidos.slice(0, cupo);

    // FUERA de transacción: hace red, y puede tardar (una request por post en
    // Upload-Post). Mantener abierta una transacción mientras tanto agarraría
    // el pool por minutos.
    const snapshots = await this.provider.getPostMetrics(delPase);
    if (snapshots.size === 0) return delPase.length;

    await this.dbService.runWithTenant(userId, async (tx) => {
      for (const [platformPostId, snapshot] of snapshots) {
        const card = porPost.get(platformPostId);
        const snapshotAt = bucketPorPost.get(platformPostId);
        // Sin bucket no se escribe: el proveedor contestó por un post que este
        // pase no pidió. Inventarle una llave dejaría una fila cuyo
        // `snapshot_at` no es el inicio de ningún bucket, y la agregación de
        // F12 descansa en que siempre lo sea.
        if (!card || !snapshotAt) continue;
        await this.repo.upsertSnapshot(tx, {
          userId,
          socialAccountId: card.socialAccountId,
          network: card.network,
          platformPostId,
          cardId: card.id,
          // Decidido al abrir el pase, no al volver la respuesta: ver el
          // comentario del reloj único en ingestAll.
          snapshotAt,
          capturedAt: snapshot.capturedAt,
          publishedAt: card.publishedAt,
          impressions: snapshot.impressions,
          reach: snapshot.reach,
          likes: snapshot.likes,
          comments: snapshot.comments,
          shares: snapshot.shares,
          raw: snapshot.raw,
          // De la config, no de `constructor.name`: es el valor con el que se
          // eligió el adapter y el mismo vocabulario que usa el resto del
          // proyecto ("upload_post", "postfast", "fake").
          provider: env.PUBLISHING_PROVIDER,
        });
      }
    });
    return delPase.length;
  }
}

function groupByUser(cards: readonly CardRow[]): Map<string, CardRow[]> {
  const porUsuario = new Map<string, CardRow[]>();
  for (const card of cards) {
    const acumulado = porUsuario.get(card.userId);
    if (acumulado) acumulado.push(card);
    else porUsuario.set(card.userId, [card]);
  }
  return porUsuario;
}
