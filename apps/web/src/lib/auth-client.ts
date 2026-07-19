import { createAuthClient } from "better-auth/react";

// Mismo origen vía proxy de Vite (basePath default: /api/auth).
export const authClient = createAuthClient();
