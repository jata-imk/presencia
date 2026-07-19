import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "isPublic";

// Marca un handler/controller como accesible sin sesión (ej. health).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
