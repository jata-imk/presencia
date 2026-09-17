import { Controller, Get, Inject, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { SessionUser } from "../auth/auth.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { StreamRegistry } from "./stream-registry.service.js";

/**
 * `GET /api/stream`: el stream de eventos del navegador (F8.6, addendum de
 * ADR-006). Se abre al entrar a la app y no se cierra.
 *
 * Escrito a mano y no con el AI SDK del chat: `EventSource` solo hace GET y no
 * acepta headers, y esto no es una respuesta que termina sino un canal. El
 * formato de texto es el mismo. La autenticación la resuelve el guard global
 * con la cookie de sesión, que `EventSource` manda por ser el mismo origen.
 *
 * Eventos: `card` (la card completa, PublicationCardDto), `card-deleted`
 * (`{ id }`), `resync` (se perdieron eventos: volver a pedir lo visible) y
 * `ping` (cada 20 s, ver HEARTBEAT_MS).
 */
@Controller("stream")
export class StreamController {
  constructor(@Inject(StreamRegistry) private readonly registry: StreamRegistry) {}

  @Get()
  open(@CurrentUser() user: SessionUser, @Req() req: Request, @Res() res: Response): void {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    // `no-transform`: que ningún intermediario lo comprima ni lo reescriba.
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // nginx (CloudPanel) ya tiene `proxy_buffering off`; esto lo garantiza
    // aunque el vhost cambie.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    // `retry`: cuánto espera EventSource para reconectar si se corta.
    res.write("retry: 3000\n: conectado\n\n");

    this.registry.add(user.id, res);
    req.on("close", () => this.registry.remove(user.id, res));
  }
}
