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
import { brandVoices, chats, folders, messages, users } from "../src/db/schema.js";

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

    return rows;
  });

  console.log(`· Usuario creado con ${String(creados.length)} chats, 1 carpeta y 1 voz de marca.`);
  printCredentials();
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
