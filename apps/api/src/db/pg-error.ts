/**
 * El error del driver de Postgres detrás de lo que lanzó drizzle. drizzle-orm
 * envuelve el error de pg y lo expone en `.cause` (mismo patrón que
 * rls.spec.ts usa para inspeccionar violaciones de RLS).
 */
export function extractPgError(error: unknown): { code?: string; constraint?: string } | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const withCode = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (typeof withCode.code === "string") {
    return { code: withCode.code, constraint: withCode.constraint as string | undefined };
  }
  return withCode.cause ? extractPgError(withCode.cause) : undefined;
}

/** SQLSTATE 23505 (unique_violation) sobre el constraint dado. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = extractPgError(error);
  return pgError?.code === "23505" && pgError.constraint === constraint;
}

/** SQLSTATE 23503 (foreign_key_violation) sobre el constraint dado. */
export function isForeignKeyViolation(error: unknown, constraint: string): boolean {
  const pgError = extractPgError(error);
  return pgError?.code === "23503" && pgError.constraint === constraint;
}
