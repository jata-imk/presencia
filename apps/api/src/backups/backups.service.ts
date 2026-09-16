import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Injectable } from "@nestjs/common";
import { env } from "../env.js";

/**
 * Configuración del backup, o `null` si el entorno no la trae. El entorno ya
 * garantiza que esté completa o ausente (ver el superRefine de `env.ts`), así
 * que acá alcanza con mirar una sola variable para decidir — pero se leen
 * todas para que el tipo salga sin `!`.
 */
export interface BackupConfig {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  databaseUrl: string;
}

export function readBackupConfig(): BackupConfig | null {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, BACKUP_DATABASE_URL } =
    env;
  if (
    !S3_ENDPOINT ||
    !S3_BUCKET ||
    !S3_ACCESS_KEY_ID ||
    !S3_SECRET_ACCESS_KEY ||
    !BACKUP_DATABASE_URL
  ) {
    return null;
  }
  return {
    endpoint: S3_ENDPOINT,
    bucket: S3_BUCKET,
    region: env.S3_REGION,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    databaseUrl: BACKUP_DATABASE_URL,
  };
}

/**
 * Clave del objeto en el bucket, por fecha UTC.
 *
 * Un objeto por día, sobreescribible: si el job corre dos veces el mismo día
 * (un reintento, un `up -d` a media noche) queda uno solo en vez de basura
 * acumulada. La retención la hace una lifecycle rule del bucket, no este
 * código: borrar objetos viejos es configuración del almacenamiento, y un
 * bucket que se le olvida a la app sigue limpiándose solo.
 */
export function backupKey(now: Date): string {
  return `backups/presencia-${now.toISOString().slice(0, 10)}.dump`;
}

@Injectable()
export class BackupsService {
  /**
   * `pg_dump` en formato custom, transmitido directo al bucket.
   *
   * Sin archivo intermedio a propósito: el disco del VPS es chico y el dump
   * crece con los datos. El proceso escribe a stdout, el SDK lo sube por
   * partes conforme llega, y si algo falla no queda medio archivo tirado.
   */
  async runDailyBackup(config: BackupConfig, now = new Date()): Promise<{ key: string }> {
    const key = backupKey(now);
    const client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });

    // El password sale de la URL y viaja por el entorno del hijo: lo que va en
    // argv lo ve cualquiera que pueda leer /proc o correr `ps` dentro del
    // contenedor, y termina en los volcados si el proceso truena.
    const dsn = new URL(config.databaseUrl);
    const password = decodeURIComponent(dsn.password);
    dsn.password = "";

    // `--format=custom` (comprimido, y `pg_restore` puede restaurar partes).
    // `--no-owner`/`--no-privileges`: el restore no tiene por qué recrear los
    // roles de este servidor, y las migraciones ya los crean donde haga falta.
    const dump = spawn(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-privileges", "--dbname", dsn.toString()],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: password ? { ...process.env, PGPASSWORD: password } : process.env,
      },
    );

    let stderr = "";
    dump.stderr.setEncoding("utf-8");
    dump.stderr.on("data", (chunk: string) => {
      // Acotado: un dump que falla escupe pocas líneas, pero no hay por qué
      // guardar sin límite lo que venga de un proceso externo.
      if (stderr.length < 4000) stderr += chunk;
    });

    // El PassThrough es lo que permite ABORTAR la subida en vez de completarla
    // con basura. Sin él —o dejando que el pipe cierre normal— un pg_dump que
    // muere a la mitad simplemente deja de escribir, el stream termina limpio,
    // el SDK da por buena la subida y el bucket queda con un objeto truncado
    // que parece el respaldo del día y no se puede restaurar. Destruir el
    // stream CON un error es lo que hace que lib-storage cancele el multipart.
    const body = new PassThrough();
    dump.stdout.pipe(body);

    const upload = new Upload({
      client,
      params: {
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: "application/octet-stream",
      },
    });

    const exited = new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => {
        // Antes de rechazar: matar el stream con el error, para que la subida
        // aborte en vez de completar un objeto a medias.
        body.destroy(error);
        reject(error);
      };
      // spawn falla así cuando pg_dump no está en la imagen (ENOENT).
      dump.on("error", fail);
      dump.on("close", (code) => {
        if (code === 0) return resolve();
        fail(new Error(`pg_dump salió con código ${code}: ${stderr.trim() || "(sin stderr)"}`));
      });
    });

    try {
      // Las dos a la vez: el dump alimenta la subida, así que esperar una
      // antes que la otra colgaría el pase.
      await Promise.all([upload.done(), exited]);
    } catch (error) {
      // Que el proceso no quede vivo consumiendo la base si quien falló fue la
      // subida.
      if (dump.exitCode === null) dump.kill("SIGTERM");
      body.destroy();
      // Por si el multipart quedó abierto del lado del SDK.
      await upload.abort().catch(() => undefined);
      throw error;
    } finally {
      client.destroy();
    }

    return { key };
  }
}
