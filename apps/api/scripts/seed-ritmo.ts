/**
 * Historial sintético para poder ver Ritmo en sus cuatro modos.
 *
 * Existe porque en producción hay tres publicaciones y solo una devuelve
 * números: el modo `full` —el único donde aparece el "+%", que es el corazón
 * del módulo— no se puede alcanzar con datos reales en meses. Sin esto,
 * "verificar en el navegador" verifica la pantalla vacía y nada más.
 *
 * Lo que siembra, y por qué cada parte:
 *
 * - **16 semanas de publicaciones** (`publication_cards`), que es lo que mide
 *   el heatmap de cadencia. Con huecos y con una racha viva al final: un
 *   heatmap parejo no deja juzgar si los tonos se distinguen.
 * - **Métricas solo de los últimos 30 días**, y siguiendo la escalera real de
 *   `frescura.ts` en vez de una fila por post. Si el seed inventara una
 *   resolución que la ingesta no produce, el motor se probaría contra datos
 *   que no existen en producción — que es la forma más cara de tener tests
 *   verdes.
 * - **Una red que no reporta nada** (LinkedIn personal), con los cinco campos
 *   en `null` y el motivo en `raw`. Es el caso `no_reporta`, y es el que más
 *   fácil se rompe: cualquier `coalesce` de más lo convierte en ceros.
 * - **Una tarde claramente mejor que el resto**, para que el "+%" tenga algo
 *   verdadero que decir y se pueda comprobar que la franja ganadora es la que
 *   se sembró.
 *
 * Determinista: el generador va con semilla fija, así que dos corridas dan el
 * mismo historial y una aserción sobre "la mejor franja" no se vuelve floja.
 */
import type { SocialNetwork } from "@presencia/shared";
import type { Tx } from "../src/db/db.service.js";
import { postMetrics, publicationCards } from "../src/db/schema.js";
import { bucketDe, EDAD_MAXIMA_DIAS } from "../src/metrics/frescura.js";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

/** 16 semanas: lo que cubre el heatmap de cadencia. */
const DIAS_HISTORIAL = 112;

/**
 * Las redes del historial. `linkedin` va sin números a propósito: es un perfil
 * personal, y LinkedIn solo da analíticas de páginas de empresa.
 */
const REDES: { network: SocialNetwork; peso: number; reporta: boolean }[] = [
  { network: "facebook", peso: 5, reporta: true },
  { network: "instagram", peso: 3, reporta: true },
  { network: "linkedin", peso: 2, reporta: false },
];

/**
 * Cuánto rinde cada franja, en múltiplos del promedio.
 *
 * La noche gana claramente y la madrugada pierde. Sin una diferencia real
 * sembrada, todos los lifts saldrían cerca de 0 y la pantalla se vería igual
 * con la fórmula bien o mal.
 */
const RENDIMIENTO_POR_HORA: Record<number, number> = {
  8: 0.8,
  10: 1.0,
  13: 0.9,
  16: 1.1,
  19: 1.8,
  21: 1.3,
  23: 0.5,
};
const HORAS: number[] = Object.keys(RENDIMIENTO_POR_HORA).map(Number);

/** Congruencial lineal: alcanza para variar los números y es reproducible. */
function generador(semilla: number): () => number {
  let estado = semilla % 2147483647;
  if (estado <= 0) estado += 2147483646;
  return () => (estado = (estado * 16807) % 2147483647) / 2147483647;
}

interface PostSembrado {
  network: SocialNetwork;
  reporta: boolean;
  publishedAt: Date;
  platformPostId: string;
  /** Cuánta gente lo vio. No depende de la hora: es el tamaño de la cuenta. */
  audiencia: number;
  /** Qué proporción de quienes lo vieron interactuaron. Acá SÍ pesa la hora. */
  tasaInteraccion: number;
}

/**
 * Publicaciones repartidas en las 16 semanas, más densas hacia el presente.
 *
 * La rampa no es decoración: simula a alguien que agarró ritmo, que es lo que
 * el heatmap tiene que saber contar. Y los últimos cuatro días van llenos
 * siempre, para que la racha actual exista y se pueda mirar.
 */
function planearPosts(ahora: Date): PostSembrado[] {
  const azar = generador(20260920);
  const posts: PostSembrado[] = [];

  for (let diasAtras = DIAS_HISTORIAL - 1; diasAtras >= 0; diasAtras--) {
    const avance = (DIAS_HISTORIAL - 1 - diasAtras) / (DIAS_HISTORIAL - 1);
    const rachaFinal = diasAtras <= 4 && diasAtras > 0;
    const probabilidad = rachaFinal || diasAtras <= 30 ? 1 : 0.2 + avance * 0.5;
    if (azar() > probabilidad) continue;

    // En los últimos 30 días se siembra más denso: es la ventana del cálculo
    // de horarios, y con menos de ~40 publicaciones ninguna franja llega al
    // umbral y el modo `full` no se puede mirar en el navegador.
    const cuantos = diasAtras <= 30 ? (azar() < 0.7 ? 2 : 1) : rachaFinal || azar() < 0.25 ? 2 : 1;
    for (let i = 0; i < cuantos; i++) {
      const hora = HORAS[Math.floor(azar() * HORAS.length)] ?? 19;
      const red = elegirRed(azar());
      const publishedAt = new Date(ahora.getTime() - diasAtras * DIA);
      publishedAt.setHours(hora, Math.floor(azar() * 50), 0, 0);
      // Un post "publicado" en el futuro sería una card vencida para el
      // reconciliador. Con horas altas y diasAtras 0 puede pasar.
      if (publishedAt.getTime() >= ahora.getTime()) continue;
      posts.push({
        network: red.network,
        reporta: red.reporta,
        publishedAt,
        platformPostId: `seed_${red.network}_${String(posts.length)}`,
        audiencia: Math.round(300 + azar() * 250),
        // La hora mueve la TASA, no el alcance, y eso no es un detalle del
        // seed: si moviera el volumen, la base `tasa` —interacciones sobre
        // alcance— la cancelaría entera y el heatmap saldría plano aunque la
        // fórmula estuviera bien. Pasó en la primera corrida de esta siembra.
        //
        // ±25% de ruido encima: sin él, todos los posts de una hora darían el
        // mismo número exacto y el promedio saldría sospechosamente limpio.
        tasaInteraccion: 0.05 * (RENDIMIENTO_POR_HORA[hora] ?? 1) * (0.75 + azar() * 0.5),
      });
    }
  }
  return posts;
}

function elegirRed(sorteo: number): (typeof REDES)[number] {
  const total = REDES.reduce((suma, red) => suma + red.peso, 0);
  let acumulado = sorteo * total;
  for (const red of REDES) {
    acumulado -= red.peso;
    if (acumulado <= 0) return red;
  }
  // Inalcanzable salvo por redondeo del flotante en el último tramo.
  return REDES[REDES.length - 1] ?? { network: "facebook", peso: 1, reporta: true };
}

/**
 * Los snapshots de un post, siguiendo la escalera de `frescura.ts`.
 *
 * Se recorre el tiempo hora por hora y se le pregunta a `bucketDe` en cuál
 * cae: así los anchos salen de la misma función que usa la ingesta, y no de
 * una copia que puede quedar vieja.
 *
 * Las series son **acumulativas**, como las reales: cada fila es el total del
 * post hasta ese momento, no el delta.
 */
function snapshotsDe(post: PostSembrado, ahora: Date): { bucket: Date; edadHoras: number }[] {
  const salida: { bucket: Date; edadHoras: number }[] = [];
  const vistos = new Set<number>();
  for (let t = post.publishedAt.getTime(); t <= ahora.getTime(); t += HORA) {
    const bucket = bucketDe(post.publishedAt, new Date(t));
    if (!bucket) break;
    if (vistos.has(bucket.getTime())) continue;
    vistos.add(bucket.getTime());
    salida.push({ bucket, edadHoras: (t - post.publishedAt.getTime()) / HORA });
  }
  return salida;
}

/** Curva de saturación: casi todo pasa en las primeras horas. */
function acumuladoEn(edadHoras: number): number {
  return 1 - Math.exp(-edadHoras / 8);
}

export async function seedRitmo(
  tx: Tx,
  userId: string,
  cuentaDe: (network: SocialNetwork) => string | null,
): Promise<{ posts: number; snapshots: number }> {
  const ahora = new Date();
  const posts = planearPosts(ahora);

  const cards = posts.map((post) => ({
    userId,
    archetype: "text_first" as const,
    network: post.network,
    status: "published" as const,
    content: {
      archetype: "text_first" as const,
      body: `Historial de dev · ${post.publishedAt.toISOString().slice(0, 10)}`,
      hashtags: [],
      assetIds: [],
    },
    scheduledAt: post.publishedAt,
    publishedAt: post.publishedAt,
    socialAccountId: cuentaDe(post.network),
    platformPostId: post.platformPostId,
    postUrl: `https://ejemplo.local/p/${post.platformPostId}`,
  }));
  const insertadas = await tx
    .insert(publicationCards)
    .values(cards)
    .returning({ id: publicationCards.id, platformPostId: publicationCards.platformPostId });
  const cardDe = new Map(insertadas.map((fila) => [fila.platformPostId, fila.id]));

  const filas = [];
  for (const post of posts) {
    const edadDias = (ahora.getTime() - post.publishedAt.getTime()) / DIA;
    // Más viejo que la ventana de medición: la card existe (y pinta en el
    // heatmap de cadencia) pero no tiene métricas, igual que en producción.
    if (edadDias > EDAD_MAXIMA_DIAS) continue;

    for (const snapshot of snapshotsDe(post, ahora)) {
      const avance = acumuladoEn(snapshot.edadHoras);
      const impressions = Math.round(post.audiencia * avance);
      const interacciones = impressions * post.tasaInteraccion;
      filas.push({
        userId,
        socialAccountId: cuentaDe(post.network),
        network: post.network,
        platformPostId: post.platformPostId,
        cardId: cardDe.get(post.platformPostId) ?? null,
        snapshotAt: snapshot.bucket,
        // Dentro del bucket, no en su borde: es lo que hace la ingesta real y
        // es de donde sale la edad con la que se comparan dos posts.
        capturedAt: new Date(post.publishedAt.getTime() + snapshot.edadHoras * HORA),
        publishedAt: post.publishedAt,
        impressions: post.reporta ? impressions : null,
        reach: post.reporta ? Math.round(impressions * 0.8) : null,
        likes: post.reporta ? Math.round(interacciones * 0.8) : null,
        comments: post.reporta ? Math.round(interacciones * 0.15) : null,
        shares: post.reporta ? Math.round(interacciones * 0.05) : null,
        raw: post.reporta
          ? { source: "seed-dev" }
          : // El motivo es tan dato como el número: es lo que distingue "no
            // preguntamos" de "preguntamos y la red dijo que no".
            { source: "seed-dev", reason: "LinkedIn no expone métricas de perfiles personales" },
        provider: "fake",
      });
    }
  }

  // Por lotes: un solo INSERT de miles de filas se pasa del límite de
  // parámetros de Postgres (65535) y truena con un mensaje que no dice esto.
  const TAMANO_LOTE = 500;
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    await tx.insert(postMetrics).values(filas.slice(i, i + TAMANO_LOTE));
  }

  return { posts: posts.length, snapshots: filas.length };
}
