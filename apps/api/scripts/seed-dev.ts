/**
 * Siembra una cuenta de desarrollo lista para usar, con datos de ejemplo.
 *
 * Por qué existe: cada sesión que toca la UI arrancaba en /login sin
 * credenciales, y había que crear la cuenta a mano y verificar el email
 * editando la DB. Además, probar contra los chats reales de Jose obliga a
 * restaurarlos después; estos datos son desechables y reproducibles.
 *
 *   pnpm --filter @presencia/api seed:dev
 *   pnpm --filter @presencia/api seed:dev -- --reset
 *
 * El signup pasa por `auth.api.signUpEmail` en vez de insertar en
 * `accounts` a mano: así el hash de la contraseña lo genera Better Auth con
 * su propio algoritmo, y no se rompe si lo cambian en una actualización.
 * Lo único que se toca directo en la DB es `email_verified` y
 * `onboarding_completed_at` — el gate de verificación manda un correo real
 * (`requireEmailVerification: true`) y en dev no hay a dónde recibirlo.
 *
 * Nunca corre contra algo que no sea local o el VPS de dev: ver assertDev().
 */
import { eq } from "drizzle-orm";
import { auth } from "../src/auth/auth.js";
import { db } from "../src/db/client.js";
import { DbService } from "../src/db/db.service.js";
import { env } from "../src/env.js";
import {
  brandVoices,
  chats,
  folders,
  messages,
  publicationCards,
  socialAccounts,
  users,
} from "../src/db/schema.js";
import type { CardContent, SocialNetwork } from "@presencia/shared";

const dbService = new DbService();

const EMAIL = "dev@presencia.local";
const PASSWORD = "presencia-dev-1234";
const NAME = "Dev Presencia";

function assertDev(): void {
  // El runtime conecta con APP_DATABASE_URL (rol presencia_app); no existe
  // DATABASE_URL en el env de la app, esa es solo de drizzle-kit.
  const url = env.APP_DATABASE_URL;
  const esLocal = /localhost|127\.0\.0\.1|::1/.test(url);
  if (!esLocal) {
    // El túnel SSH publica la DB del VPS en localhost:5434, así que lo de
    // arriba cubre el caso normal de dev. Cualquier otro host se rechaza:
    // sembrar un usuario falso en prod sería un desastre silencioso.
    throw new Error(
      "seed-dev solo corre contra una DB local o tunelizada, y APP_DATABASE_URL apunta a otro " +
        "host. Sembrar un usuario falso en producción sería un desastre silencioso.",
    );
  }
}

async function findUser(): Promise<{ id: string } | undefined> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
  return row;
}

/** Borra al usuario sembrado. El cascade de las FK limpia todo lo suyo. */
async function reset(): Promise<void> {
  const existing = await findUser();
  if (!existing) {
    console.log("· Nada que borrar: el usuario de dev no existe.");
    return;
  }
  await db.delete(users).where(eq(users.id, existing.id));
  console.log("· Usuario de dev borrado (cascade limpió chats, cards, ledger y voz).");
}

async function seed(): Promise<void> {
  const yaExiste = await findUser();
  if (yaExiste) {
    console.log(`· El usuario ya existe (${EMAIL}). Usa --reset para recrearlo desde cero.`);
    printCredentials();
    return;
  }

  await auth.api.signUpEmail({
    body: { email: EMAIL, password: PASSWORD, name: NAME, displayName: NAME },
  });

  const user = await findUser();
  if (!user) throw new Error("El signup no creó el usuario");

  // Los dos gates que en dev no se pueden pasar de otra forma: el correo de
  // verificación no tiene dónde llegar, y el onboarding pediría completar
  // la voz de marca a mano antes de dejar entrar a ninguna pantalla.
  await db
    .update(users)
    .set({ emailVerified: true, onboardingCompletedAt: new Date() })
    .where(eq(users.id, user.id));

  // Todo lo que sigue pertenece al tenant y va dentro de runWithTenant: la
  // conexión es presencia_app con FORCE RLS, así que un insert suelto ni
  // siquiera llega a fallar por permisos — la policy evalúa
  // current_setting('app.user_id') y revienta con "unrecognized
  // configuration parameter". De paso, esto ejercita el mismo camino que
  // usa la app en cada request.
  const creados = await dbService.runWithTenant(user.id, async (tx) => {
    await tx.insert(brandVoices).values({
      userId: user.id,
      name: "Voz de dev",
      isDefault: true,
      marketRegion: "Mérida, Yucatán",
      niche: ["tecnología", "productividad"],
      audience: "Creators y freelancers del sureste de México",
      keyTopics: ["automatización", "herramientas de IA"],
      preferredCtas: ["¿Te late? Cuéntame en los comentarios."],
    });

    const [carpeta] = await tx
      .insert(folders)
      .values({ userId: user.id, name: "Lanzamiento", icon: "🚀" })
      .returning({ id: folders.id });
    if (!carpeta) throw new Error("No se pudo crear la carpeta de ejemplo");

    // Variedad deliberada, para poder probar el sidebar de F6.5 completo de
    // una sola vez: uno fijado, uno en carpeta, uno archivado y sueltos.
    const ahora = Date.now();
    const hace = (horas: number) => new Date(ahora - horas * 3_600_000);

    const filas = [
      { title: "Ideas para la semana", lastMessageAt: hace(1) },
      { title: "Post sobre automatización", lastMessageAt: hace(3), pinnedAt: hace(2) },
      { title: "Hilo: herramientas de IA que sí uso", lastMessageAt: hace(8) },
      { title: "Guion del reel de Mérida", lastMessageAt: hace(26), folderId: carpeta.id },
      { title: "Newsletter — borrador viejo", lastMessageAt: hace(72), archivedAt: hace(70) },
    ];

    const rows = await tx
      .insert(chats)
      .values(filas.map((f) => ({ userId: user.id, ...f })))
      .returning({ id: chats.id });

    const conMensajes = rows[0];
    if (conMensajes) {
      await tx.insert(messages).values([
        {
          chatId: conMensajes.id,
          userId: user.id,
          role: "user" as const,
          parts: [{ type: "text", text: "Dame ideas de contenido para esta semana." }],
        },
        {
          chatId: conMensajes.id,
          userId: user.id,
          role: "assistant" as const,
          parts: [
            {
              type: "text",
              text: "Van tres, pensadas para tu audiencia de Mérida:\n\n1. Un antes/después de tu flujo de publicación.\n2. Los tres errores que cometías al programar contenido.\n3. Un recorrido rápido por las herramientas que usas a diario.",
            },
          ],
        },
      ]);
    }

    await seedCalendar(tx, user.id, {
      sueltoId: rows[0]?.id,
      enCarpetaId: rows[3]?.id,
    });

    return rows;
  });

  console.log(`· Usuario creado con ${String(creados.length)} chats, 1 carpeta y 1 voz de marca.`);
  console.log("· Calendario sembrado: publicados, programados, un grupo multi-red, un conflicto");
  console.log("  de horario, un día saturado (+N más) y borradores sin fecha.");
  printCredentials();
}

// ── Calendario (F7) ───────────────────────────────────────────────────
//
// La grilla del mes solo se puede juzgar con contenido que tenga la
// variedad real: estados mezclados, un grupo multi-red, un conflicto y un
// día que desborde el cap de 3. Sembrarlo a mano cada vez que se toca el
// módulo es justo lo que este script existe para evitar.
//
// Las cards se insertan ya "programadas" sin pasar por CardsService: no hay
// PostFast en dev, y lo que interesa acá es el estado de la fila, no el
// camino que la produce.
//
// Todo lo que no es borrador lleva provider_ref. NO es decorativo: cualquier
// card `scheduled` sin ref y con más de dos minutos de antigüedad es, para
// listOrphanedScheduled, una programación que se cortó a la mitad, y el
// reconciliador la marca `failed` — sin mirar si la fecha ya pasó. Sembrarlas
// sin ref hacía que el calendario se pusiera rojo entero a los dos minutos de
// correr el seed. El ref es sintético porque en dev no hay PostFast al que
// pedirle uno de verdad; reconcileDueCards preguntará por él y no pasará nada
// (maybeReconcile se traga los fallos del proveedor a propósito).
//
// Consecuencia con PUBLISHING_PROVIDER=postfast: cancelar una card sembrada
// devuelve 400 "subscription.required", porque ese ref no existe en PostFast
// y cancelSchedule se niega —correctamente— a marcarla cancelada sin que el
// proveedor confirme. No hay forma de sembrar una card que sea a la vez no
// huérfana y cancelable contra la API real. Para probar cancelar/deshacer en
// dev, levantar la API con PUBLISHING_PROVIDER=fake:
//
//   PUBLISHING_PROVIDER=fake pnpm --filter @presencia/api dev
//
// (directo al filtro, no por `pnpm dev`: turbo solo pasa las variables que
// declara en turbo.json, y esta no está.)

type Tx = Parameters<Parameters<DbService["runWithTenant"]>[1]>[0];

function textoDe(body: string, hashtags: string[] = []): CardContent {
  return { archetype: "text_first", body, hashtags, assetIds: [] };
}

function visualDe(caption: string): CardContent {
  return { archetype: "visual_first", caption, hashtags: [], assetIds: [crypto.randomUUID()] };
}

async function seedCalendar(
  tx: Tx,
  userId: string,
  chatIds: { sueltoId?: string; enCarpetaId?: string },
): Promise<void> {
  const redes: SocialNetwork[] = ["linkedin", "instagram", "x", "facebook"];
  const cuentas = await tx
    .insert(socialAccounts)
    .values(
      redes.map((network) => ({
        userId,
        network,
        providerRef: `seed_${network}_${crypto.randomUUID()}`,
        displayName: "Cuenta de dev",
      })),
    )
    .returning({ id: socialAccounts.id, network: socialAccounts.network });
  const cuentaDe = (network: SocialNetwork) =>
    cuentas.find((cuenta) => cuenta.network === network)?.id ?? null;

  // Anclado a AHORA y no a horas fijas del día. Es la diferencia entre un
  // seed que funciona y uno que se pudre solo: una card `scheduled` cuya
  // hora ya pasó es, para reconcileDueCards, una programación vencida, y el
  // reconciliador la marca `failed` en cuanto alguien abre el calendario.
  // Sembrar "hoy a las 08:00" a las 15:00 pintaba medio mes en rojo.
  //
  // Regla: todo lo `published` va al pasado, todo lo `scheduled` al futuro.
  const ahora = new Date();
  const enDias = (dias: number, horaDelDia: number) => {
    const fecha = new Date(ahora);
    fecha.setDate(fecha.getDate() + dias);
    fecha.setHours(horaDelDia, 0, 0, 0);
    return fecha;
  };

  const grupoId = crypto.randomUUID();

  interface Semilla {
    network: SocialNetwork;
    content: CardContent;
    scheduledAt?: Date;
    published?: boolean;
    groupId?: string;
    chatId?: string;
  }

  const semillas: Semilla[] = [
    // Pasado — publicados. Se quedan en el calendario a propósito
    // (presencia-calendario.md §6: el pipeline no borra su historia).
    {
      network: "linkedin",
      content: textoDe("Cinco lecciones de mi primer año como freelance en Mérida."),
      scheduledAt: enDias(-6, 9),
      published: true,
    },
    {
      network: "instagram",
      content: visualDe("Carrusel: las cinco apps de IA que uso todos los días ✨"),
      scheduledAt: enDias(-5, 12),
      published: true,
    },
    {
      network: "x",
      content: textoDe("La constancia le gana a la estrategia el 90% de las veces."),
      scheduledAt: enDias(-4, 18),
      published: true,
    },
    {
      network: "facebook",
      content: visualDe("Recordatorio: el sorteo cierra el viernes a medianoche."),
      scheduledAt: enDias(-2, 10),
      published: true,
    },

    // Mañana — día saturado, para ver el cap de 3 y el chip "+N más".
    {
      network: "linkedin",
      content: textoDe("Cómo armo mi semana de contenido en bloques de 90 minutos."),
      scheduledAt: enDias(1, 8),
    },
    {
      network: "instagram",
      content: visualDe("Detrás de cámaras del estudio nuevo."),
      scheduledAt: enDias(1, 11),
    },
    {
      network: "x",
      content: textoDe("Pregunta rápida: ¿publicas por la mañana o por la noche?"),
      scheduledAt: enDias(1, 14),
    },
    {
      network: "facebook",
      content: visualDe("Recordatorio: el webinar cierra el viernes."),
      scheduledAt: enDias(1, 17),
    },
    {
      network: "linkedin",
      content: textoDe("Caso de éxito: de 1k a 10k seguidores en cuatro meses."),
      scheduledAt: enDias(1, 19),
    },

    // Conflicto real: dos de LinkedIn a la MISMA hora el mismo día. Mismo
    // día en redes distintas no es conflicto, por eso las dos son LinkedIn.
    {
      network: "linkedin",
      content: textoDe("Newsletter de la semana: lo que aprendí sobre aparecer todos los días."),
      scheduledAt: enDias(3, 18),
    },
    {
      network: "linkedin",
      content: textoDe("Arrancamos el directo de esta noche, no te lo pierdas."),
      scheduledAt: enDias(3, 18),
    },

    // Grupo multi-red: mismo groupId Y mismo instante — así se agrupa en la
    // grilla. Si se cambia la hora de una sola, el grupo se rompe solo.
    {
      network: "linkedin",
      content: textoDe("Lanzamos la nueva temporada del pódcast."),
      scheduledAt: enDias(5, 18),
      groupId: grupoId,
      chatId: chatIds.enCarpetaId,
    },
    {
      network: "instagram",
      content: visualDe("Carrusel del lanzamiento de la temporada."),
      scheduledAt: enDias(5, 18),
      groupId: grupoId,
      chatId: chatIds.enCarpetaId,
    },
    {
      network: "x",
      content: textoDe("Ya está afuera la nueva temporada 🎙️"),
      scheduledAt: enDias(5, 18),
      groupId: grupoId,
      chatId: chatIds.enCarpetaId,
    },

    // Una suelta con chat de origen, para probar "Editar en Chat".
    {
      network: "instagram",
      content: visualDe("Quote del día sobre simplicidad y diseño."),
      scheduledAt: enDias(2, 12),
      chatId: chatIds.sueltoId,
    },

    // Borradores sin fecha — la bandeja del panel izquierdo (PR3).
    {
      network: "linkedin",
      content: textoDe("Tres errores que cometí escalando mi marca personal."),
      chatId: chatIds.sueltoId,
    },
    {
      network: "instagram",
      content: visualDe("Reel detrás de cámaras del setup de grabación."),
      chatId: chatIds.sueltoId,
    },
    { network: "x", content: textoDe("Hilo: cómo reutilizo un solo post en cuatro formatos 🧵") },
  ];

  const statusDe = (semilla: Semilla): "draft" | "scheduled" | "published" => {
    if (!semilla.scheduledAt) return "draft";
    return semilla.published ? "published" : "scheduled";
  };

  await tx.insert(publicationCards).values(
    semillas.map((semilla) => ({
      userId,
      chatId: semilla.chatId ?? null,
      archetype: semilla.content.archetype,
      network: semilla.network,
      content: semilla.content,
      groupId: semilla.groupId ?? null,
      status: statusDe(semilla),
      scheduledAt: semilla.scheduledAt ?? null,
      publishedAt: semilla.published ? (semilla.scheduledAt ?? null) : null,
      socialAccountId: semilla.scheduledAt ? cuentaDe(semilla.network) : null,
      providerRef: semilla.scheduledAt ? `pf_seed_${crypto.randomUUID()}` : null,
    })),
  );
}

function printCredentials(): void {
  console.log("");
  console.log("  correo:     " + EMAIL);
  console.log("  contraseña: " + PASSWORD);
  console.log("");
}

async function main(): Promise<void> {
  assertDev();
  if (process.argv.includes("--reset")) await reset();
  await seed();
}

main()
  .then(async () => {
    await dbService.onModuleDestroy();
    process.exit(0);
  })
  .catch((err: unknown) => {
    // Drizzle envuelve el error de Postgres; el motivo real (violación de
    // RLS, constraint, etc.) viene en `cause` — mismo criterio que rls.spec.ts.
    if (err instanceof Error) {
      console.error(err.message);
      if (err.cause instanceof Error) console.error("causa:", err.cause.message);
      else if (err.cause !== undefined) console.error("causa:", err.cause);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
