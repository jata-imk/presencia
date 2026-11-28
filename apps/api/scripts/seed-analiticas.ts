/**
 * Publicaciones de ejemplo para ver Analíticas completa (F12).
 *
 * El historial de Ritmo (`seed-ritmo.ts`) solo trae métricas de los últimos 30
 * días y solo de Facebook, Instagram y LinkedIn. Con eso Analíticas se ve a
 * medias: ningún cambio "vs periodo anterior" (no hay periodo anterior medido),
 * ninguna red que reporte vistas en vez de alcance, ningún concepto multi-red.
 * Esto siembra lo que falta, y cada parte tiene una razón:
 *
 * - **Un periodo anterior comparable**: Instagram y Facebook de hace 31–60
 *   días, medidos con la escalera real. Sin esto, el cambio a 30 días siempre
 *   diría "Sin periodo anterior para comparar".
 * - **TikTok sin alcance**: `reach` en null e `impressions` con número. Es la
 *   red que se calcula en interacciones por publicación y cuyo alcance dice
 *   "No disponible" (no 0). Mientras no haya filas reales de TikTok, `impressions`
 *   no se presenta como "vistas" (addendum F12 de ADR-022).
 * - **Tres conceptos multi-red** (`group_id`), uno con LinkedIn sin números,
 *   para la lente "Por concepto" y para "En otras redes" del detalle.
 * - **Una publicación de hace hora y media** sin medir (`en_camino`) y **una
 *   sin id del post en la red** (`sin_medicion`).
 * - **Dos hallazgos que sí se sostienen** (PR 8), los dos de hace 62–89 días,
 *   fuera del periodo anterior de 30, para no mover sus cambios:
 *   - Instagram: ocho carruseles a ~1.8× la tasa de lo demás. Todo lo otro de
 *     Instagram sale como "solo texto" (Ritmo siembra `text_first` y aquí van
 *     sin imagen), así que el hallazgo es "carruseles contra solo texto".
 *   - Facebook: ocho publicaciones en martes a ~1.8×. Con los martes que ya
 *     siembra Ritmo, el grupo pasa de 5 y el efecto aguanta quitar la mejor.
 *   Sin esto el seed no tiene ni un carrusel y el día no pesa en nada: la
 *   sección Hallazgos solo se podría ver vacía.
 * - **Dos hallazgos de voz** (PR 9):
 *   - TikTok: seis videos de hace 62–89 días cuyo caption abre con una
 *     pregunta, a ~1.6×. La voz de dev dice "Abres con una pregunta que pica":
 *     sale como "Tu voz ya lo dice" con `?red=tiktok` (sin red, queda fuera
 *     del tope de 3).
 *   - Facebook: "Textos largos y desarrollados", que propone. Este no se
 *     planta: sale solo, porque el historial de Ritmo mide 29 caracteres y los
 *     martes del PR 8 son más largos (una coincidencia, como las de verdad).
 *     Si cambia el seed de Ritmo puede irse; el log no lo promete.
 * - Todo en un chat dentro de la carpeta "Analíticas", para el encabezado del
 *   detalle.
 *
 * Se recrea en cada corrida, como los demás chats de ejemplo: el historial se
 * ancla a "ahora", así que sembrarlo de nuevo lo mantiene fresco.
 */
import { and, eq, inArray, like, sql } from "drizzle-orm";
import type { CardContent, SocialNetwork } from "@presencia/shared";
import type { Tx } from "../src/db/db.service.js";
import {
  brandVoices,
  chats,
  folders,
  postMetrics,
  publicationCards,
  socialAccounts,
} from "../src/db/schema.js";
import { acumuladoEn, generador, snapshotsDe } from "./seed-ritmo.js";

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

const CARPETA = "Analíticas";
const TITULO = "Analíticas: publicaciones de ejemplo";
/** Prefijo de `platform_post_id`: así se encuentran sus métricas al recrear. */
const PREFIJO = "seed_ana_";

interface Siembra {
  network: SocialNetwork;
  publishedAt: Date;
  content: CardContent;
  /** `false` = sin id del post en la red: `sin_medicion`. */
  medir: boolean;
  /** Cuántas personas lo vieron a los 30 días. */
  audiencia: number;
  /** Qué proporción interactuó. Es lo que mueve el "sobre tu promedio". */
  tasa: number;
  groupId?: string;
  /** Lo midió hace poco y todavía no tiene snapshots. */
  sinSnapshots?: boolean;
}

const video = (hook: string, caption = `${hook} ¿Cuál usas tú?`): CardContent => ({
  archetype: "video_script",
  hook,
  script: "Tres pasos, sin relleno. Corte a pantalla, demostración, cierre con pregunta.",
  caption,
  hashtags: ["productividad", "merida"],
  assetIds: [],
});

const visual = (caption: string): CardContent => ({
  archetype: "visual_first",
  caption,
  hashtags: ["productividad"],
  assetIds: [],
});

const texto = (body: string): CardContent => ({
  archetype: "text_first",
  body,
  hashtags: [],
  assetIds: [],
});

/**
 * Un carrusel de cuatro imágenes. Los ids no son de ninguna imagen guardada:
 * un carrusel se cuenta por sus imágenes (`formatoPublicado`), y sembrar
 * imágenes de verdad llenaría Biblioteca de relleno. La miniatura cae al
 * ícono del formato, como con una imagen que se eliminó.
 */
const carrusel = (caption: string): CardContent => {
  const slides = [1, 2, 3, 4].map(() => ({
    id: crypto.randomUUID(),
    assetId: crypto.randomUUID(),
  }));
  return {
    archetype: "visual_first",
    caption,
    hashtags: ["productividad"],
    assetIds: slides.map((slide) => slide.assetId),
    slides,
  };
};

const contenidoPara = (network: SocialNetwork, titulo: string): CardContent =>
  network === "tiktok" || network === "youtube"
    ? video(titulo)
    : network === "instagram"
      ? visual(titulo)
      : texto(titulo);

const TEMAS = [
  "El trend de las 5 pestañas",
  "Un día en Mérida con mi laptop",
  "Las notas que sí releo",
  "Mi rutina de los lunes",
  "Qué automaticé este mes",
  "La app que borré y no extraño",
  "Cómo respondo correos en 20 minutos",
  "Mi calendario a color, explicado",
];

function planear(ahora: Date): Siembra[] {
  const azar = generador(20261121);
  const hace = (dias: number) => new Date(ahora.getTime() - dias * DIA);
  const tema = (i: number) => TEMAS[i % TEMAS.length] ?? "Publicación de ejemplo";
  const siembras: Siembra[] = [];

  // TikTok: 26 videos en 60 días, mitad en cada periodo de 30. El periodo
  // reciente rinde un poco más, para que el cambio tenga algo que decir.
  for (let i = 0; i < 26; i++) {
    const dias = 1.5 + i * 2.3;
    siembras.push({
      network: "tiktok",
      publishedAt: hace(dias),
      content: video(tema(i)),
      medir: true,
      audiencia: Math.round(3000 + azar() * 9000),
      tasa: (dias < 30 ? 0.07 : 0.06) * (0.75 + azar() * 0.5),
    });
  }

  // Instagram y Facebook de hace 31–60 días: el periodo anterior de 30 días.
  for (const [network, cuantos, tasaBase] of [
    ["instagram", 12, 0.045],
    ["facebook", 14, 0.03],
  ] as const) {
    for (let i = 0; i < cuantos; i++) {
      siembras.push({
        network,
        publishedAt: hace(31 + (i * 29) / cuantos + azar()),
        content: contenidoPara(network, tema(i + 3)),
        medir: true,
        audiencia: Math.round(300 + azar() * 250),
        tasa: tasaBase * (0.75 + azar() * 0.5),
      });
    }
  }

  // Tres conceptos: la misma idea en varias redes, el mismo día.
  const conceptos: { titulo: string; dias: number; redes: [SocialNetwork, number][] }[] = [
    {
      titulo: "3 apps gratis que reemplazan a las de pago",
      dias: 4,
      redes: [
        ["tiktok", 2.0],
        ["instagram", 1.1],
        ["facebook", 0.8],
      ],
    },
    {
      titulo: "Mi setup de escritorio 2026",
      dias: 9,
      redes: [
        ["instagram", 1.6],
        ["tiktok", 0.9],
        ["facebook", 0.7],
      ],
    },
    {
      titulo: "Cómo organizo mi semana en 4 minutos",
      dias: 15,
      redes: [
        ["tiktok", 1.3],
        ["instagram", 1.0],
        ["linkedin", 1.0],
      ],
    },
  ];
  for (const concepto of conceptos) {
    const groupId = crypto.randomUUID();
    for (const [network, rendimiento] of concepto.redes) {
      const tiktok = network === "tiktok";
      siembras.push({
        network,
        publishedAt: hace(concepto.dias),
        content: contenidoPara(network, concepto.titulo),
        medir: true,
        audiencia: tiktok ? 8000 : 450,
        tasa: (tiktok ? 0.065 : 0.05) * rendimiento,
        groupId,
      });
    }
  }

  // Los hallazgos (PR 8). Las 18:00Z caen el mismo día en toda América
  // (12:00 en Mérida), así que el martes de UTC es el martes del creator.
  const diasEntre = (desde: number, hasta: number) =>
    Array.from({ length: hasta - desde + 1 }, (_, i) => {
      const dia = hace(desde + i);
      dia.setUTCHours(18, 0, 0, 0);
      return dia;
    });
  const viejos = diasEntre(62, 89);
  for (const [i, publishedAt] of viejos
    .filter((_, j) => j % 3 === 0)
    .slice(0, 8)
    .entries()) {
    siembras.push({
      network: "instagram",
      publishedAt,
      content: carrusel(`Carrusel: ${tema(i)}`),
      medir: true,
      audiencia: Math.round(350 + azar() * 200),
      tasa: 0.05 * 1.8 * (0.85 + azar() * 0.3),
    });
  }
  // `getUTCDay`: 2 = martes. Dos por martes, con horas distintas.
  const martes = viejos.filter((dia) => dia.getUTCDay() === 2);
  for (const [i, dia] of martes.flatMap((d) => [d, new Date(d.getTime() + 3 * HORA)]).entries()) {
    siembras.push({
      network: "facebook",
      publishedAt: dia,
      content: texto(`${tema(i + 5)} (martes)`),
      medir: true,
      audiencia: Math.round(300 + azar() * 250),
      tasa: 0.05 * 1.8 * (0.85 + azar() * 0.3),
    });
  }

  // El hallazgo de voz (PR 9): TikTok cuyos captions abren con una pregunta
  // rindieron ~40% más. La voz de dev ya dice "Abres con una pregunta que
  // pica", así que sale como "Tu voz ya lo dice" con `?red=tiktok` (sin la
  // red, el tope de 3 lo deja fuera, detrás del martes de Facebook). El de
  // Facebook que propone ("Textos largos y desarrollados") no se planta: sale
  // solo, porque el historial de Ritmo mide 29 caracteres y los martes son
  // más largos.
  for (const [i, publishedAt] of viejos
    .filter((_, j) => j % 3 === 1)
    .slice(0, 6)
    .entries()) {
    siembras.push({
      network: "tiktok",
      publishedAt,
      content: video(tema(i + 2), `¿Ya conocías esto? ${tema(i + 2)}`),
      medir: true,
      audiencia: Math.round(7200 + azar() * 600),
      tasa: 0.065 * 1.6 * (0.92 + azar() * 0.16),
    });
  }

  // Recién salida: la red todavía no contesta.
  siembras.push({
    network: "instagram",
    publishedAt: new Date(ahora.getTime() - 1.5 * HORA),
    content: visual("5 extensiones de Chrome que uso todos los días"),
    medir: true,
    audiencia: 0,
    tasa: 0,
    sinSnapshots: true,
  });

  // Publicada por un proveedor que no devolvió el id del post.
  siembras.push({
    network: "facebook",
    publishedAt: hace(5),
    content: texto("Mi curso de productividad abre inscripciones"),
    medir: false,
    audiencia: 0,
    tasa: 0,
  });

  return siembras;
}

async function cuentaDeTikTok(tx: Tx, userId: string): Promise<string> {
  const [existente] = await tx
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(eq(socialAccounts.network, "tiktok"));
  if (existente) return existente.id;
  const [nueva] = await tx
    .insert(socialAccounts)
    .values({
      userId,
      network: "tiktok",
      providerRef: `seed_tiktok_${crypto.randomUUID()}`,
      displayName: "Cuenta de dev",
    })
    .returning({ id: socialAccounts.id });
  if (!nueva) throw new Error("No se pudo crear la cuenta de TikTok");
  return nueva.id;
}

export async function seedAnaliticas(
  tx: Tx,
  userId: string,
): Promise<{ publicaciones: number; snapshots: number }> {
  // Lo de la corrida anterior: cards del chat, sus métricas y la carpeta.
  const previos = await tx.select({ id: chats.id }).from(chats).where(eq(chats.title, TITULO));
  const ids = previos.map((chat) => chat.id);
  if (ids.length > 0) {
    // Las cards antes que el chat: borrarlo las dejaría huérfanas.
    await tx.delete(publicationCards).where(inArray(publicationCards.chatId, ids));
    await tx.delete(chats).where(inArray(chats.id, ids));
  }
  // Las métricas no caen con la card (`card_id` es set null): van por prefijo.
  await tx.delete(postMetrics).where(like(postMetrics.platformPostId, `${PREFIJO}%`));
  await tx.delete(folders).where(eq(folders.name, CARPETA));
  // Los "No" y "Agregar" a hallazgos de voz (`m-…`) de la corrida anterior:
  // sin esto, un hallazgo descartado no vuelve hasta que haya cinco
  // publicaciones nuevas, y el seed no las crea. Las de voz viva no se tocan.
  await tx
    .update(brandVoices)
    .set({
      voiceProposalDecisions: sql`(
        select coalesce(jsonb_object_agg(llave, valor), '{}'::jsonb)
        from jsonb_each(${brandVoices.voiceProposalDecisions}) as e(llave, valor)
        where llave not like 'm-%'
      )`,
    })
    .where(and(eq(brandVoices.userId, userId), eq(brandVoices.isDefault, true)));

  const [carpeta] = await tx
    .insert(folders)
    .values({ userId, name: CARPETA, icon: "📊" })
    .returning({ id: folders.id });
  const [chat] = await tx
    .insert(chats)
    .values({ userId, title: TITULO, folderId: carpeta?.id, lastMessageAt: new Date() })
    .returning({ id: chats.id });
  if (!chat) throw new Error("No se pudo crear el chat de Analíticas");

  const tiktok = await cuentaDeTikTok(tx, userId);
  const cuentas = await tx
    .select({ id: socialAccounts.id, network: socialAccounts.network })
    .from(socialAccounts);
  const cuentaDe = (network: SocialNetwork) =>
    network === "tiktok" ? tiktok : (cuentas.find((c) => c.network === network)?.id ?? null);

  const ahora = new Date();
  const siembras = planear(ahora);
  const insertadas = await tx
    .insert(publicationCards)
    .values(
      siembras.map((siembra, i) => ({
        userId,
        chatId: chat.id,
        archetype: siembra.content.archetype,
        network: siembra.network,
        status: "published" as const,
        content: siembra.content,
        groupId: siembra.groupId ?? null,
        // Nace cuando se publicó, no al correr el seed. Todo el seed va en una
        // transacción y comparte `now()`: con 85 cards de "ahora", las 40 que
        // lee «Aprender de mis ediciones» ya no alcanzaban a las de voz viva y
        // su propuesta desaparecía (PR 9).
        createdAt: siembra.publishedAt,
        updatedAt: siembra.publishedAt,
        scheduledAt: siembra.publishedAt,
        publishedAt: siembra.publishedAt,
        socialAccountId: cuentaDe(siembra.network),
        platformPostId: siembra.medir ? `${PREFIJO}${String(i)}` : null,
        postUrl: siembra.medir ? `https://ejemplo.local/p/${PREFIJO}${String(i)}` : null,
      })),
    )
    .returning({ id: publicationCards.id, platformPostId: publicationCards.platformPostId });

  const filas = [];
  for (const [i, siembra] of siembras.entries()) {
    const card = insertadas[i];
    if (!card?.platformPostId || siembra.sinSnapshots) continue;
    const reporta = siembra.network !== "linkedin";
    const tiktokSinAlcance = siembra.network === "tiktok";
    for (const snapshot of snapshotsDe(siembra, ahora)) {
      const vistas = Math.round(siembra.audiencia * acumuladoEn(snapshot.edadHoras));
      const interacciones = vistas * siembra.tasa;
      filas.push({
        userId,
        socialAccountId: cuentaDe(siembra.network),
        network: siembra.network,
        platformPostId: card.platformPostId,
        cardId: card.id,
        snapshotAt: snapshot.bucket,
        capturedAt: new Date(siembra.publishedAt.getTime() + snapshot.edadHoras * HORA),
        publishedAt: siembra.publishedAt,
        impressions: reporta ? vistas : null,
        reach: reporta && !tiktokSinAlcance ? Math.round(vistas * 0.8) : null,
        likes: reporta ? Math.round(interacciones * 0.8) : null,
        comments: reporta ? Math.round(interacciones * 0.1) : null,
        shares: reporta ? Math.round(interacciones * 0.1) : null,
        raw: reporta
          ? { source: "seed-analiticas" }
          : {
              source: "seed-analiticas",
              reason: "LinkedIn no expone métricas de perfiles personales",
            },
        provider: "fake",
      });
    }
  }

  // Por lotes, por el límite de parámetros de Postgres (ver seed-ritmo).
  const TAMANO_LOTE = 500;
  for (let i = 0; i < filas.length; i += TAMANO_LOTE) {
    await tx.insert(postMetrics).values(filas.slice(i, i + TAMANO_LOTE));
  }
  return { publicaciones: siembras.length, snapshots: filas.length };
}
