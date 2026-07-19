import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import express from "express";
import { AppModule } from "./app.module.js";
import { auth } from "./auth/auth.js";
import { env } from "./env.js";

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

  await app.listen(env.PORT);
}

void bootstrap();
