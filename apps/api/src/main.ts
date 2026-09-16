import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import { AppModule } from "./app.module.js";
import { auth } from "./auth/auth.js";
import { env } from "./env.js";
import { serveSpa } from "./serve-spa.js";

async function bootstrap() {
  // bodyParser off: Better Auth necesita el body crudo en sus rutas.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix("api");

  // Express 5 (path-to-regexp v8): el wildcard es *splat, no *.
  const instance = app.getHttpAdapter().getInstance() as express.Express;
  instance.all("/api/auth/*splat", toNodeHandler(auth));

  // El resto de rutas sí parsea JSON (registrado después del handler de
  // auth: en Express 5 el stack respeta el orden de registro).
  app.use(express.json());

  // El SPA, en el mismo origen que la API (ADR-020).
  //
  // Va ANTES de que Nest arranque, y tiene que ser así: en `init()` —que
  // dispara `listen()`— Nest registra un catch-all de "no encontrado" al final
  // del stack, así que un middleware montado después nunca corre (se probó:
  // devolvía 404 hasta en `/`). Como este queda delante de los controllers, lo
  // que protege a la API no es el orden sino el filtro explícito de
  // `serve-spa.ts`: todo lo que empiece con /api pasa de largo. Una ruta nueva
  // FUERA del prefijo global (un webhook en la raíz, un /metrics) tendría que
  // sumarse a ese filtro o el índice se la comería.
  serveSpa(instance);

  // Sin esto, SIGTERM/SIGINT matan el proceso sin pasar por OnModuleDestroy:
  // ni el pool de la app ni el de pg-boss (WORKER_INLINE) cerrarían limpio.
  app.enableShutdownHooks();

  // El default de WORKER_INLINE es `true` porque hoy el único entorno que
  // existe es dev, donde tiene que estarlo (ver env.ts). Pero es el sentido
  // peligroso para prod: si el contenedor `app` se despliega sin la variable,
  // termina consumiendo la misma cola que el contenedor `worker`. Que se vea
  // en los logs de arranque, no solo en el .env.
  if (env.WORKER_INLINE) {
    console.info("[api] WORKER_INLINE=true: esta instancia también consume la cola de jobs.");
  }

  await app.listen(env.PORT);
}

void bootstrap();
