import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

// Espejo manual de apps/api/src/auth/auth.ts `user.additionalFields` — apps/web
// no depende de @presencia/api, así que no hay un tipo del auth real del
// server que inferir del lado cliente. Better Auth siempre serializa
// additionalFields en la respuesta (el plugin es solo para que TypeScript
// los conozca); si cambia uno de los dos lados, cambia el otro.
// Mismo origen vía proxy de Vite (basePath default: /api/auth).
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        displayName: { type: "string", required: false, input: true },
        timezone: { type: "string", required: false, input: false },
        onboardingCompletedAt: { type: "date", required: false, input: false },
      },
    }),
  ],
});
