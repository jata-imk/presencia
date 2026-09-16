import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mismo patrón que ai.service.spec: env.ts valida process.env al importarse,
// así que cada escenario necesita su propio entorno y un import() dinámico
// después de armarlo.

// Cada import() dinámico, tras vi.resetModules(), vuelve a cargar el SDK de
// AWS entero, y el primero del archivo pasaba de los 5 s por default en una
// máquina cargada. El límite es sobre el arranque, no sobre la lógica.
vi.setConfig({ testTimeout: 30_000 });

const BASE_ENV = {
  APP_DATABASE_URL: "postgres://test/test",
  JOBS_DATABASE_URL: "postgres://test/test",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  WEB_URL: "http://localhost:5173",
  ZEPTOMAIL_TOKEN: "test-token",
  MAIL_FROM: "test@example.com",
  GOOGLE_GENERATIVE_AI_API_KEY: "google-key",
};

const BACKUP_ENV = {
  S3_ENDPOINT: "https://cuenta.r2.cloudflarestorage.com",
  S3_BUCKET: "presencia-backups",
  S3_ACCESS_KEY_ID: "llave",
  S3_SECRET_ACCESS_KEY: "secreto",
  BACKUP_DATABASE_URL: "postgres://presencia_backup:pw@postgres:5432/presencia",
};

const ENV_KEYS = [...Object.keys(BASE_ENV), ...Object.keys(BACKUP_ENV), "S3_REGION"] as const;

const ORIGINAL: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) ORIGINAL[key] = process.env[key];

function setEnv(values: Record<string, string>) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
}

beforeEach(() => vi.resetModules());

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("clave del objeto en el bucket", () => {
  it("es una por día, en UTC", async () => {
    setEnv(BASE_ENV);
    const { backupKey } = await import("./backups.service.js");
    expect(backupKey(new Date("2026-09-16T08:00:00Z"))).toBe("backups/presencia-2026-09-16.dump");
  });

  it("no se corre de día por la zona horaria de la máquina", async () => {
    setEnv(BASE_ENV);
    const { backupKey } = await import("./backups.service.js");
    // 23:30 UTC del 16 es ya el 17 en Tokio y todavía el 16 en Mérida. La clave
    // se calcula en UTC, igual que el cron del job, así que da el mismo objeto
    // sin importar dónde corra el contenedor.
    expect(backupKey(new Date("2026-09-16T23:30:00Z"))).toBe("backups/presencia-2026-09-16.dump");
    // Y dos corridas del mismo día apuntan al mismo objeto: un reintento
    // sobreescribe en vez de acumular basura.
    expect(backupKey(new Date("2026-09-16T08:00:00Z"))).toBe(
      backupKey(new Date("2026-09-16T20:00:00Z")),
    );
  });
});

describe("configuración del backup", () => {
  it("sin variables de S3 no hay config, y la API arranca igual", async () => {
    setEnv(BASE_ENV);
    const { readBackupConfig } = await import("./backups.service.js");
    expect(readBackupConfig()).toBeNull();
  });

  it("con todas, devuelve la config y la región cae a auto", async () => {
    setEnv({ ...BASE_ENV, ...BACKUP_ENV });
    const { readBackupConfig } = await import("./backups.service.js");
    expect(readBackupConfig()).toEqual({
      endpoint: BACKUP_ENV.S3_ENDPOINT,
      bucket: BACKUP_ENV.S3_BUCKET,
      accessKeyId: BACKUP_ENV.S3_ACCESS_KEY_ID,
      secretAccessKey: BACKUP_ENV.S3_SECRET_ACCESS_KEY,
      databaseUrl: BACKUP_ENV.BACKUP_DATABASE_URL,
      // R2 ignora la región, pero el SDK exige una.
      region: "auto",
    });
  });

  it("media configuración es un error de arranque, no un backup que se salta", async () => {
    // El caso real: alguien agrega el bucket y las llaves, y olvida
    // BACKUP_DATABASE_URL. Sin este corte, el job simplemente no se
    // registraría y el operador creería que hay respaldo.
    const incompleto: Record<string, string> = { ...BASE_ENV, ...BACKUP_ENV };
    delete incompleto.BACKUP_DATABASE_URL;
    setEnv(incompleto);
    await expect(import("./backups.service.js")).rejects.toThrow(/BACKUP_DATABASE_URL/);
  });
});

describe("la salida del proceso solo termina bien si el proceso salió bien", () => {
  // Procesos REALES, no mocks: lo que se prueba es la carrera entre el fin del
  // stdout y el evento `close` con el código de salida, y un mock la resolvería
  // en el orden que uno le pida.
  async function runChild(script: string) {
    setEnv(BASE_ENV);
    const { spawn } = await import("node:child_process");
    const { gatedOutput } = await import("./backups.service.js");
    const child = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    const { body, exited } = gatedOutput(child, "proceso de prueba");

    // Lo que vería el SDK: si el stream termina limpio o con error.
    const chunks: Buffer[] = [];
    const outcome = new Promise<{ ended: boolean; error?: Error }>((resolve) => {
      body.on("data", (chunk: Buffer) => chunks.push(chunk));
      body.on("end", () => resolve({ ended: true }));
      body.on("error", (error) => resolve({ ended: false, error }));
    });
    const [result, exit] = await Promise.all([
      outcome,
      exited.then(
        () => ({ ok: true as const }),
        (error: Error) => ({ ok: false as const, error }),
      ),
    ]);
    return { result, exit, data: Buffer.concat(chunks).toString() };
  }

  it("con código 0, entrega todo y termina limpio", async () => {
    const { result, exit, data } = await runChild(
      "process.stdout.write('parte-1|'); process.stdout.write('parte-2')",
    );
    expect(exit.ok).toBe(true);
    expect(result.ended).toBe(true);
    expect(data).toBe("parte-1|parte-2");
  });

  it("si escribe la mitad y truena, el stream NUNCA termina limpio", async () => {
    // El caso real: pg_dump vuelca unas tablas y falla en otra. Si el stream
    // terminara limpio, el SDK subiría esa mitad como el respaldo del día.
    const { result, exit } = await runChild(
      "process.stdout.write('medio-dump'); process.stderr.write('fallo en brand_voices'); process.exitCode = 1",
    );
    expect(exit.ok).toBe(false);
    expect(result.ended).toBe(false);
    expect(result.error?.message).toMatch(/código 1.*fallo en brand_voices/);
  });
});
