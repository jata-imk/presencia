// Bloqueo suave (ADR-012 + F5): no es un error de programación, es el
// negocio diciendo "no alcanza". El chat gate (F5 PR2) la traduce a HTTP
// 402; spend()/charge() la lanzan crudo para que cualquier call site futuro
// decida su propio manejo.
export class InsufficientQuotaError extends Error {
  constructor(
    readonly userId: string,
    readonly requiredUnits: number,
    readonly availableUnits: number,
  ) {
    super(
      `Saldo insuficiente para el usuario ${userId}: se necesitan ${requiredUnits} unidades y hay ${availableUnits}.`,
    );
    this.name = "InsufficientQuotaError";
  }
}

/**
 * El usuario dejó de existir entre que el job lo enumeró y que le tocó su
 * turno (F8). No es un fallo del pase: una cuenta borrada es un evento normal,
 * y confundirla con un error durable haría sonar la alarma que el job relanza
 * justo para avisar de fallos que se repiten.
 */
export class UserGoneError extends Error {
  constructor(readonly userId: string) {
    super(`El usuario ${userId} ya no existe.`);
    this.name = "UserGoneError";
  }
}
