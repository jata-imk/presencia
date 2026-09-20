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
import { bucketDe, debeMedirse, EDAD_MAXIMA_DIAS } from "./frescura.js";
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

@Injectable()
export class MetricsService {
  constructor(
    @Inject(DbService) private readonly dbService: DbService,
    @Inject(CardsRepository) private readonly cardsRepo: CardsRepository,
    @Inject(ChannelsRepository) private readonly channelsRepo: ChannelsRepository,
    @Inject(MetricsRepository) private readonly repo: MetricsRepository,
    @Inject(PUBLISHING_PROVIDER) private readonly provider: PublishingProvider,
  ) {}

  /**
   * Un pase completo: enumera lo publicado, filtra por frescura, le pregunta
   * al proveedor y guarda un snapshot por post y día.
   *
   * Un usuario que falla no tumba a los demás — se acumula y se relanza al
   * final, para que el job quede marcado como fallido en `pgboss.job` y el
   * error diga quiénes fueron (patrón de ADR-008).
   *
   * `presupuestoDelPase` es parámetro y no solo constante para poder probar
   * el recorte sin fabricar 60 publicaciones. El job lo llama sin argumentos.
   */
  async ingestAll(presupuestoDelPase: number = POSTS_POR_PASE): Promise<void> {
    const ahora = new Date();
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
    const usuarios = [...porUsuario.entries()].sort(() => Math.random() - 0.5);
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

    // Dos lecturas en la misma transacción del tenant: cuándo se midió cada
    // post, y con qué cuenta se publicó.
    //
    // La cuenta hace falta porque el puerto pregunta por el `provider_ref` de
    // la CUENTA (el adapter lo parte en perfil y plataforma), que no es el
    // `provider_ref` de la card — ese identifica el envío. Y no puede venir
    // del barrido global: `social_accounts` no tiene policy de worker_scan,
    // así que un join ahí devolvería cero filas sin avisar.
    const { medidos, refsDeCuenta } = await this.dbService.runWithTenant(userId, async (tx) => {
      const medidos = await this.repo.lastBuckets(tx, [...porPost.keys()]);
      const refsDeCuenta = new Map<string, string>();
      const idsDeCuenta = new Set(
        [...porPost.values()].map((card) => card.socialAccountId).filter((id) => id !== null),
      );
      for (const id of idsDeCuenta) {
        const cuenta = await this.channelsRepo.findAccountById(tx, id);
        if (cuenta) refsDeCuenta.set(id, cuenta.providerRef);
      }
      return { medidos, refsDeCuenta };
    });

    const pedidos: PostMetricsQuery[] = [];
    for (const [platformPostId, card] of porPost) {
      const publishedAt = card.publishedAt;
      if (!publishedAt) continue;
      if (!debeMedirse({ publishedAt, ultimoBucket: medidos.get(platformPostId) ?? null, ahora }))
        continue;
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
        if (!card) continue;
        await this.repo.upsertSnapshot(tx, {
          userId,
          socialAccountId: card.socialAccountId,
          network: card.network,
          platformPostId,
          cardId: card.id,
          // El bucket sale de la edad del post y del momento en que LEÍMOS.
          // Es lo que hace que dos pases del mismo bucket caigan en la misma
          // fila, y lo que fija la resolución de la serie.
          snapshotAt:
            bucketDe(card.publishedAt ?? snapshot.capturedAt, snapshot.capturedAt) ??
            snapshot.capturedAt,
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
