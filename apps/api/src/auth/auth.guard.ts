import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth, type SessionUser } from "./auth.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

// Guard global: resuelve la sesión de Better Auth y cuelga el user del
// request. requireEmailVerification ya impide sesiones sin verificar,
// así que aquí no se re-chequea email_verified.
@Injectable()
export class AuthGuard implements CanActivate {
  // @Inject explícito: el runner dev (tsx/esbuild) no emite decorator
  // metadata, así que Nest no puede inferir los tipos del constructor.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user: SessionUser }>();
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      throw new UnauthorizedException("Necesitas iniciar sesión.");
    }
    req.user = session.user;
    return true;
  }
}
