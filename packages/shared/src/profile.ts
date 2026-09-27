import { z } from "zod";

// Contratos del perfil (Mi perfil + onboarding). displayName y timezone son
// additionalFields de Better Auth (apps/api/src/auth/auth.ts); este schema
// es lo que valida nuestro endpoint /api/me, no Better Auth directo —
// timezone tiene input: false ahí a propósito (no debe llegar sin validar
// contra Intl.supportedValuesOf).

export const updateProfileBodySchema = z.object({
  // `null` = quitarlo y volver al nombre de la cuenta (F9.7). Con
  // autoguardado, vaciar el campo tiene que hacer algo: antes no había forma
  // de borrarlo una vez puesto.
  displayName: z.string().trim().min(1).max(60).nullable().optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), {
      message: "Esa zona horaria no es válida.",
    })
    .optional(),
});
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;

export interface ProfileDto {
  id: string;
  name: string;
  email: string;
  displayName: string | null;
  timezone: string;
  onboardingCompletedAt: string | null;
}
